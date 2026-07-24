import { describe, expect, it } from "vitest";
import { haversineMeters, type LatLng } from "@/lib/workoutTrack";
import {
  computeGhostRaceResult,
  ensureGhostTimestamps,
  ghostDistanceAtElapsed,
  ghostPositionAtElapsed,
  ghostTotalDurationMs,
  ghostTrailAtElapsed,
  timeAtDistanceMs,
} from "@/lib/ghostRace";

// 위도 0.001° ≈ 111m — 등속 직선 경로 시뮬레이션 (workoutTrack.test.ts와 동일 관례)
function straightPath(count: number, msPerPoint: number): LatLng[] {
  return Array.from({ length: count }, (_, i) => ({
    lat: i * 0.001,
    lng: 0,
    t: i * msPerPoint,
  }));
}

function cumulativeAt(path: LatLng[], index: number): number {
  let sum = 0;
  for (let i = 1; i <= index; i++) sum += haversineMeters(path[i - 1], path[i]);
  return sum;
}

describe("ghostDistanceAtElapsed", () => {
  const path = straightPath(6, 10_000); // 6개 지점, 10초 간격

  it("시작 전(0 이하)은 0", () => {
    expect(ghostDistanceAtElapsed(path, 0)).toBe(0);
    expect(ghostDistanceAtElapsed(path, -100)).toBe(0);
  });

  it("포인트 사이는 시간 비례 보간", () => {
    const at2 = cumulativeAt(path, 2);
    const at3 = cumulativeAt(path, 3);
    const mid = ghostDistanceAtElapsed(path, 25_000); // 2·3번째 포인트(20s·30s) 사이
    expect(mid).toBeGreaterThan(at2);
    expect(mid).toBeLessThan(at3);
  });

  it("정확히 포인트 시각이면 그 지점의 누적거리", () => {
    expect(ghostDistanceAtElapsed(path, 30_000)).toBeCloseTo(cumulativeAt(path, 3), 5);
  });

  it("유령의 총 소요시간을 넘으면 총거리에서 멈춤", () => {
    const total = cumulativeAt(path, path.length - 1);
    expect(ghostDistanceAtElapsed(path, 999_000)).toBeCloseTo(total, 5);
  });

  it("포인트가 1개 이하면 0", () => {
    expect(ghostDistanceAtElapsed([{ lat: 0, lng: 0, t: 0 }], 5_000)).toBe(0);
    expect(ghostDistanceAtElapsed([], 5_000)).toBe(0);
  });

  it("타임라인은 첫 포인트 기준 재정렬 — GPS 락 머리 구간을 재생하지 않고 즉시 달린다", () => {
    // 실기록처럼 첫 포인트 t가 0이 아닌 경우(GPS 락 지연 30초)
    const offset = straightPath(6, 10_000).map((p) => ({ ...p, t: p.t! + 30_000 }));
    const plain = straightPath(6, 10_000);
    expect(ghostDistanceAtElapsed(offset, 0)).toBe(0);
    // 오프셋과 무관하게 같은 경과시간엔 같은 거리(음수 외삽도 없어야 한다)
    expect(ghostDistanceAtElapsed(offset, 5_000)).toBeGreaterThan(0);
    expect(ghostDistanceAtElapsed(offset, 25_000)).toBeCloseTo(
      ghostDistanceAtElapsed(plain, 25_000),
      6,
    );
  });
});

describe("ghostTotalDurationMs", () => {
  it("첫 포인트 기준 재정렬된 '움직인 시간'을 반환한다", () => {
    const offset = straightPath(6, 10_000).map((p) => ({ ...p, t: p.t! + 30_000 }));
    expect(ghostTotalDurationMs(offset)).toBe(50_000); // 80_000이 아니라 재정렬된 50초
    expect(ghostTotalDurationMs([])).toBe(0);
  });
});

describe("timeAtDistanceMs", () => {
  const path = straightPath(6, 10_000);

  it("targetM 0 이하는 시작 시각", () => {
    expect(timeAtDistanceMs(path, 0)).toBe(0);
  });

  it("포인트 사이 거리는 보간된 시각", () => {
    const at2 = cumulativeAt(path, 2);
    const at3 = cumulativeAt(path, 3);
    const t = timeAtDistanceMs(path, (at2 + at3) / 2);
    expect(t).not.toBeNull();
    expect(t!).toBeGreaterThan(20_000);
    expect(t!).toBeLessThan(30_000);
  });

  it("경로 총거리를 넘으면 null", () => {
    const total = cumulativeAt(path, path.length - 1);
    expect(timeAtDistanceMs(path, total + 1_000)).toBeNull();
  });

  it("포인트가 1개 이하면 null", () => {
    expect(timeAtDistanceMs([{ lat: 0, lng: 0, t: 0 }], 100)).toBeNull();
  });
});

describe("ghostPositionAtElapsed", () => {
  const path = straightPath(6, 10_000);

  it("시작 전은 첫 지점에 고정", () => {
    expect(ghostPositionAtElapsed(path, -100)).toEqual({ lat: path[0].lat, lng: path[0].lng });
    expect(ghostPositionAtElapsed(path, 0)).toEqual({ lat: path[0].lat, lng: path[0].lng });
  });

  it("총 소요시간을 넘으면 마지막 지점에 고정", () => {
    const last = path[path.length - 1];
    expect(ghostPositionAtElapsed(path, 999_000)).toEqual({ lat: last.lat, lng: last.lng });
  });

  it("포인트 사이는 시간 비례 위경도 보간", () => {
    const pos = ghostPositionAtElapsed(path, 25_000); // 2번째(20s)와 3번째(30s) 사이 절반
    expect(pos).not.toBeNull();
    expect(pos!.lat).toBeCloseTo((path[2].lat + path[3].lat) / 2, 6);
  });

  it("포인트가 1개면 항상 그 지점", () => {
    const single: LatLng = { lat: 1, lng: 2, t: 0 };
    expect(ghostPositionAtElapsed([single], 5_000)).toEqual({ lat: 1, lng: 2 });
  });

  it("첫 포인트 t 오프셋과 무관하게 같은 경과시간이면 같은 위치(뒤로 외삽 없음)", () => {
    const offset = straightPath(6, 10_000).map((p) => ({ ...p, t: p.t! + 30_000 }));
    const plain = straightPath(6, 10_000);
    expect(ghostPositionAtElapsed(offset, 0)).toEqual({
      lat: offset[0].lat,
      lng: offset[0].lng,
    });
    expect(ghostPositionAtElapsed(offset, 25_000)).toEqual(
      ghostPositionAtElapsed(plain, 25_000),
    );
  });

  it("빈 경로는 null", () => {
    expect(ghostPositionAtElapsed([], 5_000)).toBeNull();
  });
});

describe("ghostTrailAtElapsed", () => {
  const path = straightPath(6, 10_000);

  it("시작 시점엔 첫 지점 하나만", () => {
    const trail = ghostTrailAtElapsed(path, 0);
    expect(trail).toHaveLength(1);
    expect(trail[0]).toEqual({ lat: path[0].lat, lng: path[0].lng, t: 0 });
  });

  it("중간 시점엔 지나온 포인트 + 보간된 현재 위치가 끝점", () => {
    const trail = ghostTrailAtElapsed(path, 25_000); // 2번째(20s) 지나 3번째(30s) 전
    expect(trail.length).toBe(4); // 0,10,20s 지점(3개) + 보간 현재위치(1개)
    const current = ghostPositionAtElapsed(path, 25_000)!;
    expect(trail[trail.length - 1]).toEqual(current);
  });

  it("총 소요시간을 넘으면 전체 포인트 그대로(중복 없이)", () => {
    const trail = ghostTrailAtElapsed(path, 999_000);
    expect(trail).toHaveLength(path.length);
  });

  it("빈 경로는 빈 배열", () => {
    expect(ghostTrailAtElapsed([], 5_000)).toEqual([]);
  });
});

describe("ensureGhostTimestamps", () => {
  // t 없는 구형 기록 — 위도 등간격 직선(구간 거리 동일)
  function legacyPath(count: number): LatLng[] {
    return Array.from({ length: count }, (_, i) => ({ lat: i * 0.001, lng: 0 }));
  }

  it("t 없는 구형 경로에 총 소요시간을 거리 비례로 배분한다", () => {
    const path = ensureGhostTimestamps(legacyPath(5), 40); // 4구간 등거리 × 40초
    expect(path[0].t).toBe(0);
    expect(path[4].t).toBe(40_000);
    // 등거리 구간이므로 t도 등간격(10초씩)
    expect(path[1].t).toBeCloseTo(10_000, -2);
    expect(path[2].t).toBeCloseTo(20_000, -2);
    // 합성 후엔 유령 계산이 실제로 동작한다(격차·마커의 회귀 방지)
    expect(ghostDistanceAtElapsed(path, 20_000)).toBeGreaterThan(0);
    expect(ghostPositionAtElapsed(path, 20_000)).not.toBeNull();
  });

  it("t가 이미 있는 신형 경로는 그대로 반환한다", () => {
    const path = straightPath(5, 7_000);
    expect(ensureGhostTimestamps(path, 999)).toBe(path);
  });

  it("포인트 부족·소요시간 0·이동거리 0이면 원본 그대로", () => {
    expect(ensureGhostTimestamps(legacyPath(1), 40)).toEqual(legacyPath(1));
    expect(ensureGhostTimestamps(legacyPath(5), 0)).toEqual(legacyPath(5));
    const stationary: LatLng[] = [{ lat: 1, lng: 1 }, { lat: 1, lng: 1 }];
    expect(ensureGhostTimestamps(stationary, 40)).toEqual(stationary);
  });
});

describe("computeGhostRaceResult", () => {
  it("동일 경로면 delta 0", () => {
    const path = straightPath(6, 10_000);
    const result = computeGhostRaceResult(path, path);
    expect(result).not.toBeNull();
    expect(result!.deltaMs).toBe(0);
  });

  it("내가 더 빠르면 음수 delta", () => {
    const ghost = straightPath(6, 10_000); // 10초/구간
    const me = straightPath(6, 8_000); // 8초/구간 — 더 빠름
    const result = computeGhostRaceResult(me, ghost);
    expect(result).not.toBeNull();
    expect(result!.deltaMs).toBeLessThan(0);
  });

  it("유령이 더 길면 내 총거리까지만 비교", () => {
    const ghost = straightPath(10, 10_000);
    const me = straightPath(4, 10_000);
    const result = computeGhostRaceResult(me, ghost);
    expect(result).not.toBeNull();
    expect(result!.overlapDistanceM).toBeCloseTo(cumulativeAt(me, me.length - 1), 5);
  });

  it("겹치는 구간이 너무 짧으면 null", () => {
    // 0.0003° ≈ 33m — MIN_GHOST_RESULT_OVERLAP_M(50m) 미만
    const short: LatLng[] = [
      { lat: 0, lng: 0, t: 0 },
      { lat: 0.0003, lng: 0, t: 10_000 },
    ];
    expect(computeGhostRaceResult(short, short)).toBeNull();
  });
});

// ── 추적 끊김(갭) 공정성 — 유령의 갭(지하철·앱 재시작)을 직선 거리로 인정하지 않는다 ──
describe("고스트 갭 처리", () => {
  /**
   * 555m 러닝(10초/111m) + 333m 갭(10초 만에 이동 — 비현실) + 222m 러닝.
   * 갭을 인정하면 유령 총거리 ≈1111m·갭 구간 순간이동, 제외하면 ≈778m.
   */
  function gapGhost(): LatLng[] {
    const a = straightPath(6, 10_000); // t 0~50s, ≈555m
    const bStart = 5 * 0.001 + 0.003;
    const b = [0, 1, 2].map((i) => ({
      lat: bStart + i * 0.001,
      lng: 0,
      t: 60_000 + i * 10_000,
    }));
    return [...a, ...b];
  }

  it("유령 총거리는 갭을 제외한다(내 라이브 거리와 동일 규칙)", () => {
    const total = ghostDistanceAtElapsed(gapGhost(), 999_999);
    expect(total).toBeGreaterThan(760);
    expect(total).toBeLessThan(800); // 갭 포함이면 ≈1111
  });

  it("갭 시간창 동안 유령 거리는 늘지 않는다(순간이동 금지)", () => {
    const path = gapGhost();
    const before = ghostDistanceAtElapsed(path, 50_000); // 갭 직전
    const during = ghostDistanceAtElapsed(path, 59_000); // 갭 한가운데
    expect(during).toBeCloseTo(before, 5);
  });

  it("timeAtDistanceMs가 갭 너머 거리를 갭 통과 시간으로 앞당기지 않는다", () => {
    // 600m 지점은 갭(50~60초) 이후의 실주행 구간에서 도달해야 한다.
    const t = timeAtDistanceMs(gapGhost(), 600);
    expect(t).not.toBeNull();
    expect(t!).toBeGreaterThan(60_000);
  });

  it("computeGhostRaceResult의 유령 총거리도 갭 제외 기준", () => {
    const me = straightPath(8, 10_000); // ≈778m 연속 주행
    const result = computeGhostRaceResult(me, gapGhost());
    expect(result).not.toBeNull();
    // overlap = min(내 778, 유령 갭제외 778) ≈ 778 — 갭 포함(1111)이었다면 내 거리가 하한이 됨
    expect(result!.overlapDistanceM).toBeLessThan(800);
    expect(result!.overlapDistanceM).toBeGreaterThan(760);
  });
});
