import { haversineMeters, pathDistanceMeters, type LatLng } from "./workoutTrack";

/**
 * 결과 카드를 보여주기엔 너무 짧게 겹친 구간(노이즈 방지).
 * 테스트 편의를 위해 임시로 50m까지 완화해둔 상태 — 안정화 후 200m로 되돌릴 것.
 */
export const MIN_GHOST_RESULT_OVERLAP_M = 50;

/**
 * 유령 후보 최소 거리 — 결과 판정 최소 겹침과 같게 둔다.
 * (이보다 짧으면 골라도 결과가 안 나오는 후보라 목록에서 제외하는 것.)
 */
export const MIN_GHOST_CANDIDATE_M = MIN_GHOST_RESULT_OVERLAP_M;

function activePoints(path: LatLng[]): (LatLng & { t: number })[] {
  return path.filter((p): p is LatLng & { t: number } => p.t != null);
}

/**
 * 경로에 t(시작 후 경과 ms)가 없는 구형 기록을 유령으로 쓸 수 있게, 총 소요시간을
 * 누적 거리에 비례 배분해 t를 합성한다(등속 가정 — 근사치).
 * t가 이미 있는 신형 기록은 그대로 반환한다. 유령 격차·마커·결과 계산이 모두 t에
 * 의존하므로, 유령 선택 시 반드시 이 함수를 거쳐야 구형 기록에서도 동작한다.
 */
export function ensureGhostTimestamps(path: LatLng[], durationSec: number): LatLng[] {
  if (path.length < 2 || durationSec <= 0) return path;
  if (activePoints(path).length >= 2) return path;

  const totalM = pathDistanceMeters(path);
  if (totalM <= 0) return path;

  const totalMs = durationSec * 1000;
  let cum = 0;
  return path.map((p, i) => {
    if (i > 0) cum += haversineMeters(path[i - 1], path[i]);
    return { ...p, t: Math.round((cum / totalM) * totalMs) };
  });
}

/*
 * 유령 타임라인은 첫 타임드 포인트 기준으로 재정렬(re-base)한다.
 * 기록의 첫 t는 0이 아니라 GPS 락이 잡힌 시점(수 초~수십 초)이라, 절대 t를 그대로 재생하면
 * 유령이 레이스 시작 후 한참을 출발점에 서 있게 된다. 재정렬하면 시작과 동시에 달리기 시작하고,
 * 결과 비교(timeAtDistanceMs)도 양쪽 모두 "움직인 시간" 기준이라 대칭적으로 공정하다.
 */

/** 유령이 실제로 움직인 활동시간(ms, 첫 포인트 기준 재정렬). 유효한 경로가 아니면 0. */
export function ghostTotalDurationMs(path: LatLng[]): number {
  const pts = activePoints(path);
  return pts.length ? pts[pts.length - 1].t - pts[0].t : 0;
}

/**
 * 유령이 활동 경과시간(elapsedMs, 정지시간 제외)에 도달한 누적거리(m).
 * elapsedMs가 유령의 총 소요시간을 넘으면 유령은 결승 지점에 멈춰 있는 것으로 본다.
 */
export function ghostDistanceAtElapsed(ghostPath: LatLng[], elapsedMs: number): number {
  const pts = activePoints(ghostPath);
  if (pts.length < 2 || elapsedMs <= 0) return 0;

  const at = elapsedMs + pts[0].t; // 재정렬된 경과시간 → 기록의 절대 t로 환산
  const lastT = pts[pts.length - 1].t;
  if (at >= lastT) return pathDistanceMeters(pts);

  let cum = 0;
  for (let i = 1; i < pts.length; i++) {
    const t0 = pts[i - 1].t;
    const t1 = pts[i].t;
    if (at <= t1) {
      const segM = haversineMeters(pts[i - 1], pts[i]);
      const frac = t1 > t0 ? (at - t0) / (t1 - t0) : 0;
      return cum + frac * segM;
    }
    cum += haversineMeters(pts[i - 1], pts[i]);
  }
  return cum;
}

/**
 * 경로가 targetM 거리를 지나는 시점의 움직인 시간(ms, 첫 포인트 기준 재정렬).
 * 경로가 그 거리에 못 미치면 null.
 */
export function timeAtDistanceMs(path: LatLng[], targetM: number): number | null {
  const pts = activePoints(path);
  if (pts.length < 2) return null;
  if (targetM <= 0) return 0;

  let cum = 0;
  for (let i = 1; i < pts.length; i++) {
    const segM = haversineMeters(pts[i - 1], pts[i]);
    const prevCum = cum;
    cum += segM;
    if (cum >= targetM) {
      const frac = segM > 0 ? (targetM - prevCum) / segM : 1;
      return pts[i - 1].t + frac * (pts[i].t - pts[i - 1].t) - pts[0].t;
    }
  }
  return null;
}

/** 유령의 elapsedMs 시점 실제 위경도 — 구간 내 시간 비례 선형보간, 범위 밖은 시작/끝점에 고정. */
export function ghostPositionAtElapsed(ghostPath: LatLng[], elapsedMs: number): LatLng | null {
  const pts = activePoints(ghostPath);
  if (pts.length === 0) return null;
  if (pts.length === 1) return { lat: pts[0].lat, lng: pts[0].lng };

  const base = pts[0].t;
  const lastT = pts[pts.length - 1].t;
  const at = Math.max(base, Math.min(elapsedMs + base, lastT));

  for (let i = 1; i < pts.length; i++) {
    const t0 = pts[i - 1].t;
    const t1 = pts[i].t;
    if (at <= t1) {
      const frac = t1 > t0 ? (at - t0) / (t1 - t0) : 0;
      return {
        lat: pts[i - 1].lat + frac * (pts[i].lat - pts[i - 1].lat),
        lng: pts[i - 1].lng + frac * (pts[i].lng - pts[i - 1].lng),
      };
    }
  }
  return { lat: pts[pts.length - 1].lat, lng: pts[pts.length - 1].lng };
}

/**
 * 유령이 elapsedMs까지 "지나온" 구간만 반환 — 나(라이브 GPS)처럼 시간에 따라 자란다.
 * 마지막에 보간 위치를 이어붙여 끊김 없이 매끄럽게 만든다.
 */
export function ghostTrailAtElapsed(ghostPath: LatLng[], elapsedMs: number): LatLng[] {
  const pts = activePoints(ghostPath);
  if (pts.length === 0) return [];

  const base = pts[0].t;
  const current = ghostPositionAtElapsed(ghostPath, elapsedMs);
  const traveled = pts.filter((p) => p.t - base <= elapsedMs);
  if (!current) return traveled;

  const last = traveled[traveled.length - 1];
  if (last && last.lat === current.lat && last.lng === current.lng) return traveled;
  return [...traveled, current];
}

export type GhostRaceResult = {
  /** 나와 유령 둘 다 도달한 구간(m) — 더 긴 쪽의 나머지는 비교에서 제외. */
  overlapDistanceM: number;
  myTimeMs: number;
  ghostTimeMs: number;
  /** 음수면 내가 더 빠름. */
  deltaMs: number;
};

/**
 * 거리 목표(결승선) 없이, 둘 다 뛴 만큼(overlap)만 기준으로 시간을 비교한다.
 * 겹친 구간이 너무 짧으면(MIN_GHOST_RESULT_OVERLAP_M 미만) null.
 */
export function computeGhostRaceResult(
  myPath: LatLng[],
  ghostPath: LatLng[],
): GhostRaceResult | null {
  const myTotalM = pathDistanceMeters(activePoints(myPath));
  const ghostTotalM = pathDistanceMeters(activePoints(ghostPath));
  const overlapM = Math.min(myTotalM, ghostTotalM);
  if (overlapM < MIN_GHOST_RESULT_OVERLAP_M) return null;

  const myTimeMs = timeAtDistanceMs(myPath, overlapM);
  const ghostTimeMs = timeAtDistanceMs(ghostPath, overlapM);
  if (myTimeMs == null || ghostTimeMs == null) return null;

  return { overlapDistanceM: overlapM, myTimeMs, ghostTimeMs, deltaMs: myTimeMs - ghostTimeMs };
}
