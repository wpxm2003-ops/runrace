import { describe, expect, it } from "vitest";
import { computeElevationStats, trustedAltitude } from "@/lib/elevation";
import type { LatLng } from "@/lib/workoutTrack";

function point(lng: number, ele?: number): LatLng {
  return ele == null ? { lat: 37, lng } : { lat: 37, lng, ele };
}

/** 결정적 PRNG — 시뮬레이션 테스트가 매 실행 동일한 노이즈를 재현하게 한다. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 1Hz·보폭 1.7m(≈10분/km) GPS 트랙 합성. AR(1) 고도 드리프트(정상 σ≈2.9m) 포함. */
function simulateTrack(
  seed: number,
  samples: number,
  terrain: (distanceM: number) => number,
  coldStart: (sampleIndex: number) => number = () => 0,
): LatLng[] {
  const rand = mulberry32(seed);
  const points: LatLng[] = [];
  let drift = 0;
  for (let i = 0; i < samples; i++) {
    drift = drift * 0.98 + (rand() - 0.5) * 2;
    points.push(point(127 + i * 0.0000191, 100 + terrain(i * 1.7) + drift + coldStart(i)));
  }
  return points;
}

describe("computeElevationStats", () => {
  it("returns null when the path has no elevation data", () => {
    expect(computeElevationStats([point(127), point(127.001), point(127.002)])).toBeNull();
  });

  it("calculates an elevation profile and min/max values", () => {
    const stats = computeElevationStats([
      point(127, 10),
      point(127.001, 40),
      point(127.002, 80),
      point(127.003, 60),
      point(127.004, 20),
    ]);

    expect(stats).not.toBeNull();
    expect(stats!.profile).toHaveLength(5);
    expect(stats!.maxElevationM).toBeGreaterThan(stats!.minElevationM);
    expect(stats!.totalAscentM).toBeGreaterThan(0);
    expect(stats!.totalDescentM).toBeGreaterThanOrEqual(0);
  });

  it("완만한 오르막(포인트당 델타가 노이즈 문턱값 미만)도 누적해서 상승고도로 잡는다", () => {
    // 실측 회귀: GPS 포인트가 촘촘하면 스텝당 델타가 3m 문턱값을 못 넘어 전부 버려지고
    // totalAscentM/totalDescentM이 0이 되던 버그. 0.2m/스텝씩 60번 올랐다 60번 내려오는
    // 합성 경로(총 12m)로 재발을 막는다.
    const points: LatLng[] = [];
    for (let i = 0; i <= 60; i++) points.push(point(127 + i * 0.0001, 100 + i * 0.2));
    for (let i = 1; i <= 60; i++) points.push(point(127.0061 + i * 0.0001, 112 - i * 0.2));

    const stats = computeElevationStats(points);

    // 스무딩(5포인트 이동평균)이 꼭짓점을 살짝 깎아서 원본 12m보다는 조금 낮게 나온다 —
    // 고친 전에는 정확히 0이었으므로, 원래 상승분의 대부분(9m 초과)이 살아있는지만 확인.
    expect(stats).not.toBeNull();
    expect(stats!.totalAscentM).toBeGreaterThan(9);
    expect(stats!.totalAscentM).toBeLessThanOrEqual(12);
    expect(stats!.totalDescentM).toBeGreaterThan(9);
    expect(stats!.totalDescentM).toBeLessThanOrEqual(12);
  });

  it("문턱값 미만의 자잘한 노이즈는 반전으로 취급하지 않고 상승 추세를 이어간다", () => {
    // 10에서 22로 올라가는 도중 0.4m짜리 딥이 끼어도(MIN_ELEVATION_DELTA_M=3m 미만),
    // 그걸 별도 하강으로 끊지 않고 계속 상승 추세로 흡수해야 한다.
    const points: LatLng[] = [
      point(127, 10),
      point(127.001, 15),
      point(127.002, 14.6), // 노이즈 딥(0.4m) — 상승 추세를 끊으면 안 됨
      point(127.003, 22),
      point(127.004, 30),
    ];

    const stats = computeElevationStats(points);

    expect(stats).not.toBeNull();
    expect(stats!.totalAscentM).toBeGreaterThan(0);
    expect(stats!.totalDescentM).toBe(0);
  });

  it("재정박 단절 구간의 거리·고도 점프를 이동거리나 상승고도로 합치지 않는다", () => {
    const points: LatLng[] = [
      point(127.0000, 10),
      point(127.0001, 10),
      point(127.0002, 10),
      { ...point(127.0007, 100), breakBefore: true }, // 약 44m 이동·90m 고도차는 일시정지 중
      point(127.0008, 100),
      point(127.0009, 100),
    ];

    const stats = computeElevationStats(points);

    expect(stats).not.toBeNull();
    expect(stats!.totalAscentM).toBe(0);
    expect(stats!.totalDescentM).toBe(0);
    // 두 연속 구간의 실제 네 개 구간만 누적되고, 재정박 약 44m는 빠져야 한다.
    expect(stats!.profile[stats!.profile.length - 1].distanceM).toBeLessThan(40);
  });

  it("평지에 단발 GPS 스파이크가 껴도 가짜 언덕을 만들지 않는다", () => {
    // 실측 회귀: 튄 고도 샘플 하나가 min-max 상대 스케일 차트 전체를 산길처럼 보이게 했다.
    // 평지(100m) 50포인트 중 한 점만 140m로 튄 경로 — 리샘플 중앙값+스파이크 필터가 걸러내
    // 고도 변화 1m 미만(=사실상 평지) 판정으로 null이 나와야 한다.
    const points: LatLng[] = [];
    for (let i = 0; i < 50; i++) points.push(point(127 + i * 0.0001, i === 10 ? 140 : 100));

    expect(computeElevationStats(points)).toBeNull();
  });

  it("콜드스타트 진동 + GPS 드리프트가 있는 평지 코스는 거의 평평하게 정리된다", () => {
    // 실측 회귀: 평지로만 달렸는데 초반 고도가 수십 m 요동치고, 상대 스케일 차트 전체가
    // 산길처럼 그려졌다. 첫 2분간 감쇠 진동(최대 22m)을 포함한 3km 평지 합성 트랙에서
    // 필터 후 잔여 고도 범위가 작아야(수 m) 차트가 평지로 읽힌다.
    const points = simulateTrack(
      42,
      1800,
      () => 0,
      (i) => 22 * Math.exp(-i / 40) * Math.cos(i / 7),
    );

    const stats = computeElevationStats(points);
    const range = stats ? stats.maxElevationM - stats.minElevationM : 0;
    const ascent = stats ? stats.totalAscentM : 0;
    expect(range).toBeLessThan(8);
    expect(ascent).toBeLessThan(15);
  });

  it("짧은 코스(1km) 중간의 내려갔다 올라오는 구간이 뭉개지지 않는다", () => {
    // 실측 회귀(잠실 1km 걷기): 중간에 내려갔다 올라오는 굴다리 구간이 차트에 전혀 안 나왔다.
    // 원인은 중앙값·평활 창이 거리 고정값(125m·175m)이라, 1km 코스에서는 창 하나가 경로의
    // 17.5%를 덮어 실제 지형을 지워버린 것. 창을 총거리 비율로도 제한해 해결했다.
    // 노이즈 없는 합성 지형으로 "필터가 지형을 얼마나 깎는가"만 측정한다.
    const points: LatLng[] = [];
    for (let i = 0; i < 630; i++) {
      const d = i * 1.6;
      // 400~600m 구간에서 6m 내려갔다 올라오는 V자 딥
      const drop = d < 400 || d > 600 ? 0 : d < 500 ? -((d - 400) / 100) * 6 : -6 + ((d - 500) / 100) * 6;
      points.push({ lat: 37, lng: 127 + i * 0.000018, ele: 20 + drop });
    }

    const stats = computeElevationStats(points);
    expect(stats).not.toBeNull();

    const inDip = stats!.profile.filter((p) => p.distanceM >= 400 && p.distanceM <= 600);
    const outside = stats!.profile.filter((p) => p.distanceM < 400 || p.distanceM > 600);
    const keptDepth =
      Math.max(...outside.map((p) => p.elevationM)) - Math.min(...inDip.map((p) => p.elevationM));

    // 고치기 전에는 2.9m(48%)까지 깎여 차트에서 보이지 않았다. 원래 6m의 3분의 2 이상 보존.
    expect(keptDepth).toBeGreaterThan(4);
    expect(stats!.totalDescentM).toBeGreaterThan(4);
  });

  it("실제 언덕(완만한 경사)은 필터를 강화해도 상승고도·범위가 보존된다", () => {
    // 800m에 걸쳐 30m 오르는 3.75% 경사 — 경사 클램프(30%)·중앙값·평활을 다 거쳐도
    // 실제 지형은 살아남아야 한다.
    const points = simulateTrack(7, 1800, (d) =>
      d < 800 ? 0 : d < 1600 ? (d - 800) * 0.0375 : d < 2400 ? 30 - (d - 1600) * 0.0375 : 0,
    );

    const stats = computeElevationStats(points);
    expect(stats).not.toBeNull();
    expect(stats!.totalAscentM).toBeGreaterThan(20);
    expect(stats!.totalAscentM).toBeLessThan(45);
    expect(stats!.maxElevationM - stats!.minElevationM).toBeGreaterThan(20);
  });
});

describe("trustedAltitude", () => {
  it("수직 정확도가 명백히 나쁜 고도(콜드스타트 수렴 전)는 버린다", () => {
    expect(trustedAltitude(85, 40, 8)).toBeUndefined();
    expect(trustedAltitude(85, 10, 8)).toBe(85);
  });

  it("실기기가 일상적으로 보고하는 중간 품질(15~30m)은 버리지 않는다", () => {
    // 실측 회귀: 문턱을 15m로 조였더니 새 기록의 고도 샘플이 통째로 버려져 차트가 망가졌다.
    // 중간 품질 노이즈는 표시 단계 필터가 처리하므로 수집 단계에서는 통과시켜야 한다.
    expect(trustedAltitude(85, 25, 8)).toBe(85);
    expect(trustedAltitude(85, 30, 8)).toBe(85);
  });

  it("수직 정확도 미제공 기기는 수평 정확도로 대신 거른다", () => {
    expect(trustedAltitude(85, null, 35)).toBeUndefined();
    expect(trustedAltitude(85, null, 10)).toBe(85);
    expect(trustedAltitude(85, null, null)).toBe(85);
  });

  it("고도 값 자체가 없거나 무효면 undefined", () => {
    expect(trustedAltitude(null, 5, 5)).toBeUndefined();
    expect(trustedAltitude(Number.NaN, 5, 5)).toBeUndefined();
  });
});
