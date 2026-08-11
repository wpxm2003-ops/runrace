import { describe, expect, it } from "vitest";
import {
  computeBestSegments,
  computeKmSplits,
  creditedPathDistanceMeters,
  estimateCalories,
  evaluateVehicleTier,
  formatClock,
  IDLE_AUTO_PAUSE_WINDOW_MS,
  idleAutoPauseAt,
  pathBoundsKey,
  pathDistanceMeters,
  pickWorkoutStartSeed,
  slideIdleAnchor,
  isInKorea,
  splitPathAtGaps,
  WORKOUT_START_FIX_MAX_ACCURACY_M,
  WORKOUT_START_FIX_MAX_AGE_MS,
} from "@/lib/workoutTrack";
import type {
  IdleAnchor,
  LatLng,
  VehicleDetectState,
  WorkoutStartFix,
} from "@/lib/workoutTrack";

describe("pickWorkoutStartSeed", () => {
  const OWNER_UID = "runner-a";
  const STARTED_AT_MS = 100_000;

  const fix = (overrides: Partial<WorkoutStartFix> = {}): WorkoutStartFix => ({
    ownerUid: OWNER_UID,
    lat: 37.5665,
    lng: 126.978,
    accuracyM: 10,
    fixAtMs: STARTED_AT_MS - 1_000,
    receivedAtMs: STARTED_AT_MS - 900,
    ...overrides,
  });

  it("정확도와 신선도가 허용 경계와 같으면 시작점으로 사용한다", () => {
    expect(pickWorkoutStartSeed([
      fix({
        accuracyM: WORKOUT_START_FIX_MAX_ACCURACY_M,
        fixAtMs: STARTED_AT_MS - WORKOUT_START_FIX_MAX_AGE_MS,
        receivedAtMs: STARTED_AT_MS - WORKOUT_START_FIX_MAX_AGE_MS,
      }),
    ], OWNER_UID, STARTED_AT_MS)).toEqual({
      lat: 37.5665,
      lng: 126.978,
      t: 0,
    });
  });

  it.each([
    ["측정 시각이 오래됨", { fixAtMs: STARTED_AT_MS - WORKOUT_START_FIX_MAX_AGE_MS - 1 }],
    ["수신 시각이 오래됨", { receivedAtMs: STARTED_AT_MS - WORKOUT_START_FIX_MAX_AGE_MS - 1 }],
    ["측정 시각이 시작 이후임", { fixAtMs: STARTED_AT_MS + 1 }],
    ["수신 시각이 시작 이후임", { receivedAtMs: STARTED_AT_MS + 1 }],
  ])("%s이면 거절한다", (_label, overrides) => {
    expect(pickWorkoutStartSeed([fix(overrides)], OWNER_UID, STARTED_AT_MS)).toBeNull();
  });

  it.each([
    ["null", null],
    ["NaN", Number.NaN],
    ["음수", -1],
    ["허용치를 초과", WORKOUT_START_FIX_MAX_ACCURACY_M + 0.1],
  ])("정확도가 %s이면 거절한다", (_label, accuracyM) => {
    expect(pickWorkoutStartSeed([
      fix({ accuracyM }),
    ], OWNER_UID, STARTED_AT_MS)).toBeNull();
  });

  it.each([
    ["위도 NaN", { lat: Number.NaN }],
    ["위도 하한 미만", { lat: -90.001 }],
    ["위도 상한 초과", { lat: 90.001 }],
    ["경도 NaN", { lng: Number.NaN }],
    ["경도 하한 미만", { lng: -180.001 }],
    ["경도 상한 초과", { lng: 180.001 }],
    ["측정 시각 NaN", { fixAtMs: Number.NaN }],
    ["수신 시각 NaN", { receivedAtMs: Number.NaN }],
  ])("%s 좌표 후보는 거절한다", (_label, overrides) => {
    expect(pickWorkoutStartSeed([fix(overrides)], OWNER_UID, STARTED_AT_MS)).toBeNull();
  });

  it("다른 사용자의 예열 좌표는 거절한다", () => {
    expect(pickWorkoutStartSeed([
      fix({ ownerUid: "runner-b" }),
    ], OWNER_UID, STARTED_AT_MS)).toBeNull();
  });

  it("가장 최신 후보가 부정확하면 직전의 신선하고 양호한 좌표를 고른다", () => {
    expect(pickWorkoutStartSeed([
      fix({ lat: 37.1, lng: 127.1, fixAtMs: STARTED_AT_MS - 2_000 }),
      fix({ lat: 37.2, lng: 127.2, accuracyM: 50, fixAtMs: STARTED_AT_MS - 500 }),
    ], OWNER_UID, STARTED_AT_MS)).toEqual({ lat: 37.1, lng: 127.1, t: 0 });
  });

  it("시작 전 여러 유효 좌표 중 마지막 한 점만 t=0 시작점으로 반환한다", () => {
    const fixes = [
      fix({ lat: 37.1, lng: 127.1, fixAtMs: STARTED_AT_MS - 2_000 }),
      fix({ lat: 37.2, lng: 127.2, fixAtMs: STARTED_AT_MS - 1_000 }),
      fix({ lat: 37.3, lng: 127.3, fixAtMs: STARTED_AT_MS - 100 }),
    ];

    expect(pickWorkoutStartSeed(fixes, OWNER_UID, STARTED_AT_MS)).toEqual({
      lat: 37.3,
      lng: 127.3,
      t: 0,
    });
  });
});

describe("formatClock", () => {
  it("1시간 미만은 mm:ss", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(5)).toBe("00:05");
    expect(formatClock(65)).toBe("01:05");
    expect(formatClock(3599)).toBe("59:59");
  });
  it("1시간 이상은 h:mm:ss", () => {
    expect(formatClock(3600)).toBe("1:00:00");
    expect(formatClock(3661)).toBe("1:01:01");
  });
  it("음수는 0으로 클램프", () => {
    expect(formatClock(-5)).toBe("00:00");
  });
});

describe("estimateCalories", () => {
  it("km당 약 65kcal(반올림)", () => {
    expect(estimateCalories(0)).toBe(0);
    expect(estimateCalories(1000)).toBe(65);
    expect(estimateCalories(5000)).toBe(325);
  });
});

describe("방치 자동 일시정지", () => {
  const atMeters = (meters: number): LatLng => ({
    // 위도 1°를 보수적으로 111km로 잡아 경계값 50m가 부동소수 오차로 바로 아래가 되지 않게 한다.
    lat: meters / 111_000,
    lng: 0,
  });

  it("첫 양호 fix는 원래 판정 시각을 유지한 채 공간 기준점만 심는다", () => {
    expect(slideIdleAnchor(
      { timeMs: 1_000, distanceM: 500 },
      20_000,
      500,
      atMeters(0),
    )).toEqual({
      timeMs: 1_000,
      distanceM: 500,
      position: atMeters(0),
      maxDisplacementM: 0,
    });
  });

  it("누적 100m와 공간 폭 50m를 함께 채워야 창을 새로 시작한다", () => {
    const anchor = {
      timeMs: 0,
      distanceM: 500,
      position: atMeters(0),
      maxDisplacementM: 0,
    };
    const shortProgress = slideIdleAnchor(anchor, 30_000, 599, atMeters(60));
    expect(shortProgress.timeMs).toBe(0); // 누적거리 99m

    expect(slideIdleAnchor(shortProgress, 60_000, 600, atMeters(60))).toEqual({
      timeMs: 60_000,
      distanceM: 600,
      position: atMeters(60),
      maxDisplacementM: 0,
    });
  });

  it("5~10m GPS 왕복 드리프트는 누적거리가 100m를 넘어도 창을 갱신하지 않는다", () => {
    let anchor: IdleAnchor = {
      timeMs: 1_000,
      distanceM: 0,
      position: atMeters(0),
      maxDisplacementM: 0,
    };
    for (let i = 1; i <= 30; i++) {
      anchor = slideIdleAnchor(
        anchor,
        i * 60_000,
        i * 8,
        atMeters(i % 2 === 0 ? -4 : 4),
      );
    }
    expect(anchor.timeMs).toBe(1_000);
    expect(anchor.distanceM).toBe(0);
    expect(anchor.maxDisplacementM).toBeLessThan(10);
  });

  it("50m 셔틀 왕복은 누적 100m 실제 이동으로 인정한다", () => {
    const anchor = {
      timeMs: 0,
      distanceM: 0,
      position: atMeters(0),
      maxDisplacementM: 0,
    };
    const outbound = slideIdleAnchor(anchor, 5 * 60_000, 50, atMeters(50));
    expect(outbound.timeMs).toBe(0);
    expect(outbound.maxDisplacementM).toBeGreaterThanOrEqual(49);

    const returned = slideIdleAnchor(outbound, 10 * 60_000, 100, atMeters(0));
    expect(returned.timeMs).toBe(10 * 60_000);
    expect(returned.distanceM).toBe(100);
  });

  it("30분간 기준 거리를 못 채우면 앵커 시각으로 소급해 발동한다", () => {
    const anchor = { timeMs: 1_000, distanceM: 0 };
    expect(idleAutoPauseAt(anchor, 1_000 + IDLE_AUTO_PAUSE_WINDOW_MS - 1)).toBeNull();
    // 발동 시각은 감지 시각(now)이 아니라 앵커 시각 — 방치된 시간이 소급 제외된다.
    expect(idleAutoPauseAt(anchor, 1_000 + IDLE_AUTO_PAUSE_WINDOW_MS)).toBe(1_000);
    expect(idleAutoPauseAt(anchor, 1_000 + IDLE_AUTO_PAUSE_WINDOW_MS * 5)).toBe(1_000);
  });

  it("주기적으로 100m를 채우는 러닝은 아무리 길어도 발동하지 않는다", () => {
    let anchor: IdleAnchor = {
      timeMs: 0,
      distanceM: 0,
      position: atMeters(0),
      maxDisplacementM: 0,
    };
    // 10분마다 100m씩(아주 느린 산책 수준) 3시간 직선 진행
    for (let i = 1; i <= 18; i++) {
      const now = i * 10 * 60_000;
      anchor = slideIdleAnchor(anchor, now, i * 100, atMeters(i * 100));
      expect(idleAutoPauseAt(anchor, now)).toBeNull();
    }
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

  it("120m 이하라도 breakBefore면 재정박 단절로 표시한다", () => {
    const path: LatLng[] = [
      { lat: 0, lng: 0 },
      { lat: 0.0004, lng: 0, breakBefore: true },
      { lat: 0.0008, lng: 0 },
    ];
    expect(splitPathAtGaps(path)).toEqual({
      solidLines: [[path[1], path[2]]],
      gapLines: [[path[0], path[1]]],
    });
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

  it("120m 이하 재정박 구간도 breakBefore면 거리에서 제외한다", () => {
    const path: LatLng[] = [
      tp(0, 0),
      { ...tp(0.0005, 30), breakBefore: true },
      tp(0.001, 60),
    ];
    const credited = creditedPathDistanceMeters(path);
    expect(credited).toBeGreaterThan(50);
    expect(credited).toBeLessThan(60);
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

  it("120m 이하 재정박도 가로질러 PB 구간을 만들 수 없다", () => {
    // 각 연속 구간은 약 2km라 3km PB가 성립하지 않는다. 중간 50m는 120m보다 작지만
    // 일시정지 후 재정박된 점이므로 두 구간을 합쳐서는 안 된다.
    const path: LatLng[] = [];
    for (let i = 0; i <= 20; i++) path.push(tp(i * STEP_DEG, i * 36));
    const secondStart = 20 * STEP_DEG + 0.0005;
    for (let j = 1; j <= 20; j++) {
      path.push({
        ...tp(secondStart + (j - 1) * STEP_DEG, 20 * 36 + j * 36),
        ...(j === 1 ? { breakBefore: true } : {}),
      });
    }
    expect(computeBestSegments(path)).toEqual({});
  });
});

describe("isInKorea — 지도 공급자 선택 기준", () => {
  it("국내 좌표는 true", () => {
    expect(isInKorea({ lat: 37.5, lng: 127.0 })).toBe(true); // 서울
    expect(isInKorea({ lat: 33.4, lng: 126.5 })).toBe(true); // 제주
    expect(isInKorea({ lat: 37.24, lng: 131.86 })).toBe(true); // 독도
  });

  it("국외 좌표는 false — 카카오맵은 국외 타일이 없어 빈 지도가 된다", () => {
    expect(isInKorea({ lat: 14.6, lng: 120.98 })).toBe(false); // 마닐라
    expect(isInKorea({ lat: 35.68, lng: 139.69 })).toBe(false); // 도쿄
    expect(isInKorea({ lat: 40.71, lng: -74.0 })).toBe(false); // 뉴욕
    expect(isInKorea({ lat: -33.87, lng: 151.2 })).toBe(false); // 시드니
  });

  it("직사각형 하나로는 한국이던 일본 서부 — 후쿠오카·대마도는 false", () => {
    // 실측 리뷰 회귀: 단일 박스(33~39, 124~132)는 후쿠오카를 한국으로 판정했다.
    expect(isInKorea({ lat: 33.59, lng: 130.4 })).toBe(false); // 후쿠오카
    expect(isInKorea({ lat: 34.2, lng: 129.29 })).toBe(false); // 대마도 이즈하라
    expect(isInKorea({ lat: 33.25, lng: 129.87 })).toBe(false); // 사세보
  });

  it("본토 경계의 한국 좌표는 유지된다", () => {
    expect(isInKorea({ lat: 35.15, lng: 129.11 })).toBe(true); // 부산 광안리
    expect(isInKorea({ lat: 36.02, lng: 129.36 })).toBe(true); // 포항
    expect(isInKorea({ lat: 33.2, lng: 126.25 })).toBe(true); // 제주 서귀포 서부
    expect(isInKorea({ lat: 34.07, lng: 125.12 })).toBe(true); // 가거도(서남단)
    expect(isInKorea({ lat: 38.5, lng: 128.43 })).toBe(true); // 고성(동북단)
    expect(isInKorea({ lat: 37.5, lng: 130.87 })).toBe(true); // 울릉도
  });
});
