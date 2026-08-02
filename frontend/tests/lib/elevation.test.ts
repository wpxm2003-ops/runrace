import { describe, expect, it } from "vitest";
import { computeElevationStats, trustedAltitude } from "@/lib/elevation";
import type { LatLng } from "@/lib/workoutTrack";

function point(lng: number, ele?: number): LatLng {
  return ele == null ? { lat: 37, lng } : { lat: 37, lng, ele };
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
});

describe("trustedAltitude", () => {
  it("수직 정확도가 나쁜 고도(콜드스타트 수렴 전)는 버린다", () => {
    expect(trustedAltitude(85, 40, 8)).toBeUndefined();
    expect(trustedAltitude(85, 10, 8)).toBe(85);
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
