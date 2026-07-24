import { describe, expect, it } from "vitest";
import {
  computeBestSegments,
  computeKmSplits,
  creditedPathDistanceMeters,
  estimateCalories,
  evaluateVehicleTier,
  formatDuration,
  pathBoundsKey,
  pathDistanceMeters,
  splitPathAtGaps,
} from "@/lib/workoutTrack";
import type { LatLng, VehicleDetectState } from "@/lib/workoutTrack";

describe("formatDuration", () => {
  it("1시간 미만은 mm:ss", () => {
    expect(formatDuration(0)).toBe("00:00");
    expect(formatDuration(5)).toBe("00:05");
    expect(formatDuration(65)).toBe("01:05");
    expect(formatDuration(3599)).toBe("59:59");
  });
  it("1시간 이상은 h:mm:ss", () => {
    expect(formatDuration(3600)).toBe("1:00:00");
    expect(formatDuration(3661)).toBe("1:01:01");
  });
  it("음수는 0으로 클램프", () => {
    expect(formatDuration(-5)).toBe("00:00");
  });
});

describe("estimateCalories", () => {
  it("km당 약 65kcal(반올림)", () => {
    expect(estimateCalories(0)).toBe(0);
    expect(estimateCalories(1000)).toBe(65);
    expect(estimateCalories(5000)).toBe(325);
  });
});

describe("splitPathAtGaps", () => {
  // 위도 0.001° ≈ 111m — 연속 구간 시뮬레이션
  const close = (lat: number): LatLng => ({ lat, lng: 0 });
  // 위도 1° ≈ 111km — GAP_THRESHOLD_M(120m)를 훌쩍 넘는 점프
  const far = (lat: number): LatLng => ({ lat, lng: 0 });

  it("끊김 없는 경로는 하나의 실선, 점선 없음", () => {
    const path = [close(0), close(0.001), close(0.002)];
    const { solidLines, gapLines } = splitPathAtGaps(path);
    expect(solidLines).toEqual([path]);
    expect(gapLines).toEqual([]);
  });

  it("큰 점프가 있으면 실선을 끊고 점선 구간을 만든다", () => {
    const path = [close(0), close(0.001), far(1), far(1.001)];
    const { solidLines, gapLines } = splitPathAtGaps(path);
    expect(solidLines).toEqual([[path[0], path[1]], [path[2], path[3]]]);
    expect(gapLines).toEqual([[path[1], path[2]]]);
  });

  it("점 1개짜리 잔여 구간은 실선에 포함하지 않는다", () => {
    const path = [close(0), close(0.001), far(1)];
    const { solidLines, gapLines } = splitPathAtGaps(path);
    expect(solidLines).toEqual([[path[0], path[1]]]);
    expect(gapLines).toEqual([[path[1], path[2]]]);
  });

  it("빈 경로·단일 점은 실선·점선 모두 없음", () => {
    expect(splitPathAtGaps([])).toEqual({ solidLines: [], gapLines: [] });
    expect(splitPathAtGaps([close(0)])).toEqual({ solidLines: [], gapLines: [] });
  });

  it("커스텀 임계값을 적용할 수 있다", () => {
    // 0.0005° ≈ 55.5m — 기본 120m 임계값으로는 끊기지 않지만 50m로는 끊긴다
    const path = [close(0), close(0.0005)];
    expect(splitPathAtGaps(path).gapLines).toEqual([]);
    expect(splitPathAtGaps(path, 50).gapLines).toEqual([path]);
  });
});

describe("pathBoundsKey", () => {
  it("빈 경로는 빈 문자열", () => {
    expect(pathBoundsKey([])).toBe("");
  });

  it("길이·시작점·끝점이 같으면 동일한 키", () => {
    const a: LatLng[] = [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }, { lat: 2, lng: 2 }];
    const b: LatLng[] = [{ lat: 0, lng: 0 }, { lat: 9, lng: 9 }, { lat: 2, lng: 2 }];
    expect(pathBoundsKey(a)).toBe(pathBoundsKey(b));
  });

  it("끝점이 다르면 다른 키", () => {
    const a: LatLng[] = [{ lat: 0, lng: 0 }, { lat: 2, lng: 2 }];
    const b: LatLng[] = [{ lat: 0, lng: 0 }, { lat: 3, lng: 3 }];
    expect(pathBoundsKey(a)).not.toBe(pathBoundsKey(b));
  });
});

// ── 공용 헬퍼 ────────────────────────────────────────────────────────────────
type VehicleStep = { speedMps: number | null; accuracyM: number; nowMs: number };

const GOOD = 10; // ≤20m → isGpsGood
const WEAK = 50; // >30m → 즉시 weak
const RUN = 2; // ≤4m/s → 러닝 저속

function vehicleState(hasHadGoodFix: boolean): VehicleDetectState {
  return {
    tier: "normal",
    suspectHighSinceMs: null,
    confirmedHighSinceMs: null,
    lowSpeedSinceMs: null,
    weakGpsSinceMs: null,
    recoveringFromWeakGps: false,
    hasHadGoodFix,
    accuracyRecent: [],
  };
}

// 결과(VehicleDetectResult)는 state의 상위집합이라 다음 tick의 state로 그대로 넘길 수 있다.
function runFrom(hasHadGoodFix: boolean, steps: VehicleStep[]) {
  let s: VehicleDetectState = vehicleState(hasHadGoodFix);
  let last = evaluateVehicleTier({ ...steps[0], state: s });
  s = last;
  for (let i = 1; i < steps.length; i++) {
    last = evaluateVehicleTier({ ...steps[i], state: s });
    s = last;
  }
  return last;
}

describe("evaluateVehicleTier — 복귀 시간 분기(치팅 위험별)", () => {
  // 이 블록은 러닝 도중(이미 양호 fix를 받은 뒤)의 복귀 타이밍을 검증한다.
  const run = (steps: VehicleStep[]) => runFrom(true, steps);

  it("GPS 끊김(weak) 복귀는 저속·양호 GPS가 2초 지속되면 normal", () => {
    // t0 weak → t1 recovering(빠른 대상) → t3 (2초 경과) normal
    expect(
      run([
        { speedMps: RUN, accuracyM: WEAK, nowMs: 0 },
        { speedMps: RUN, accuracyM: GOOD, nowMs: 1000 },
        { speedMps: RUN, accuracyM: GOOD, nowMs: 3000 },
      ]).tier,
    ).toBe("normal");
  });

  it("weak 복귀도 2초 전에는 아직 recovering(거리 차단 유지)", () => {
    const r = run([
      { speedMps: RUN, accuracyM: WEAK, nowMs: 0 },
      { speedMps: RUN, accuracyM: GOOD, nowMs: 1000 },
      { speedMps: RUN, accuracyM: GOOD, nowMs: 2500 }, // 1.5초만 경과
    ]);
    expect(r.tier).toBe("recovering");
    expect(r.blockDistance).toBe(true);
  });

  it("탈것(속도) 감지 복귀는 2초로는 부족하고 5초 지나야 normal", () => {
    // t0 즉시 confirmed(≥9m/s) → t1 recovering(느린 대상)
    const at3s = run([
      { speedMps: 10, accuracyM: GOOD, nowMs: 0 },
      { speedMps: RUN, accuracyM: GOOD, nowMs: 1000 },
      { speedMps: RUN, accuracyM: GOOD, nowMs: 3000 }, // 2초 경과 — weak라면 풀렸을 시점
    ]);
    expect(at3s.tier).toBe("recovering"); // 탈것 복귀는 아직 안 풀림

    const at6s = run([
      { speedMps: 10, accuracyM: GOOD, nowMs: 0 },
      { speedMps: RUN, accuracyM: GOOD, nowMs: 1000 },
      { speedMps: RUN, accuracyM: GOOD, nowMs: 6000 }, // 5초 경과
    ]);
    expect(at6s.tier).toBe("normal");
  });

  it("weak 빠른 복귀도 저속 조건은 동일 — 고속이면 안 풀린다(탈것 악용 방지)", () => {
    const r = run([
      { speedMps: RUN, accuracyM: WEAK, nowMs: 0 }, // weak_gps
      { speedMps: 10, accuracyM: GOOD, nowMs: 1000 }, // recovering이지만 고속
      { speedMps: 10, accuracyM: GOOD, nowMs: 5000 }, // 4초가 지나도 고속이라
    ]);
    expect(r.tier).toBe("recovering");
    expect(r.blockDistance).toBe(true);
  });
});

describe("evaluateVehicleTier — 콜드스타트 예열(첫 양호 fix 전)", () => {
  // 시작 직후 GPS 확보 지연을 지하철/탈것으로 오인해 초반 기록을 통째로 막던 버그 방지.
  const cold = (steps: VehicleStep[]) => runFrom(false, steps);

  it("예열 중 weak가 15초를 넘겨도 confirmed(탈것)로 승격하지 않는다", () => {
    const r = cold([
      { speedMps: null, accuracyM: WEAK, nowMs: 0 },
      { speedMps: RUN, accuracyM: WEAK, nowMs: 16_000 }, // 16초 경과 — 예열이 아니면 confirmed였을 시점
    ]);
    expect(r.tier).toBe("weak_gps");
    expect(r.hasHadGoodFix).toBe(false);
  });

  it("첫 양호 fix가 오면 복구 대기 없이 즉시 normal + reanchor로 기록 시작", () => {
    const r = cold([
      { speedMps: null, accuracyM: WEAK, nowMs: 0 }, // 예열 weak_gps
      { speedMps: RUN, accuracyM: GOOD, nowMs: 1000 }, // 첫 양호 fix — 1초 만에 바로 정상
    ]);
    expect(r.tier).toBe("normal");
    expect(r.blockDistance).toBe(false);
    expect(r.blockPathPoints).toBe(false);
    expect(r.reanchorNextPoint).toBe(true);
    expect(r.hasHadGoodFix).toBe(true);
  });

  it("예열 완료 후에는 지하철 감지가 정상 작동 — mid-run weak는 15초 뒤 confirmed", () => {
    const r = cold([
      { speedMps: RUN, accuracyM: GOOD, nowMs: 0 }, // 예열 완료(양호 fix)
      { speedMps: RUN, accuracyM: WEAK, nowMs: 1000 }, // 이후 GPS 끊김
      { speedMps: null, accuracyM: WEAK, nowMs: 17_000 }, // 16초 지속 → 지하철 확정
    ]);
    expect(r.tier).toBe("confirmed");
  });
});

// ── 추적 끊김(갭) 처리 — 지하철·일시정지 이동을 직선으로 이어 거리·PB를 만들지 않는다 ──
// 위도 0.0009° ≈ 100m(갭 임계 120m 미만), 0.0027° ≈ 300m(임계 초과 = 추적 끊김).
const STEP_DEG = 0.0009; // ≈ 100.07m
const GAP_DEG = 0.0027; // ≈ 300.2m

/** latDeg 지점, tSec초의 경로 포인트. */
function tp(latDeg: number, tSec: number): LatLng {
  return { lat: latDeg, lng: 0, t: tSec * 1000 };
}

/**
 * 600m 러닝(30초/100m) → 300m 추적 끊김(5분여) → 500m 러닝(30초/100m).
 * A: t 0~180초, 갭 후 B: t 510~660초.
 */
function gapPath(): LatLng[] {
  const path: LatLng[] = [];
  for (let i = 0; i <= 6; i++) path.push(tp(i * STEP_DEG, i * 30));
  const bStart = 6 * STEP_DEG + GAP_DEG;
  for (let j = 1; j <= 6; j++) path.push(tp(bStart + (j - 1) * STEP_DEG, 480 + j * 30));
  return path;
}

describe("creditedPathDistanceMeters — 갭 제외 누적 거리", () => {
  it("120m 초과 구간은 직선으로 잇지 않는다(복원 폴백용)", () => {
    const path = gapPath();
    const full = pathDistanceMeters(path);
    const credited = creditedPathDistanceMeters(path);
    // 전체 - 갭 제외 = 갭 한 구간(≈300m)
    expect(full - credited).toBeGreaterThan(295);
    expect(full - credited).toBeLessThan(305);
    expect(credited).toBeGreaterThan(1050);
    expect(credited).toBeLessThan(1150);
  });
});

describe("computeKmSplits — 추적 끊김", () => {
  it("갭 구간은 거리 0으로 취급 — 스플릿이 라이브 거리 집계와 일치한다", () => {
    const splits = computeKmSplits(gapPath());
    expect(splits).toHaveLength(2);
    // 1km 지점은 갭 300m를 빼고 B 구간 끝쪽에서 완성된다(t≈600초).
    // 갭 거리를 세던 종전엔 갭 도중(t≈300초대)에 완성돼 페이스가 부당하게 빨랐다.
    expect(splits[0].distanceM).toBe(1000);
    expect(splits[0].paceSec).toBeGreaterThan(560);
    expect(splits[0].paceSec).toBeLessThan(640);
    // 잔여 구간(≈100m)은 순수 러닝 페이스(≈300초/km)로 나온다.
    expect(splits[1].paceSec).toBeGreaterThan(270);
    expect(splits[1].paceSec).toBeLessThan(330);
  });
});

describe("computeBestSegments — 추적 끊김", () => {
  it("연속 경로에서는 목표 거리 구간 페이스를 계산한다", () => {
    // 3km 연속(100m/36초 = 6:00/km)
    const path: LatLng[] = [];
    for (let i = 0; i <= 30; i++) path.push(tp(i * STEP_DEG, i * 36));
    const r = computeBestSegments(path);
    expect(r["3k"]).toBeGreaterThan(355);
    expect(r["3k"]).toBeLessThan(365);
  });

  it("갭을 가로지르는 윈도우로 PB를 만들 수 없다", () => {
    // 2km 러닝 + 300m 갭(60초 만에 이동 — 탈것) + 2km 러닝.
    // 갭을 직선으로 이으면 총 4.3km가 되어 3k 최고 구간이 조작되지만,
    // 연속 구간(각 2km)만으로는 3km 윈도우가 성립하지 않아야 한다.
    const path: LatLng[] = [];
    for (let i = 0; i <= 20; i++) path.push(tp(i * STEP_DEG, i * 36));
    const bStart = 20 * STEP_DEG + GAP_DEG;
    for (let j = 1; j <= 20; j++) path.push(tp(bStart + (j - 1) * STEP_DEG, 20 * 36 + 60 + j * 36));
    expect(computeBestSegments(path)).toEqual({});
  });
});
