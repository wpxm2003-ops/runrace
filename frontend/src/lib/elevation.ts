import {
  creditedSegmentMeters,
  isPathBreak,
  type LatLng,
} from "./workoutTrack";

export type ElevationProfilePoint = {
  distanceM: number;
  elevationM: number;
};

export type ElevationStats = {
  totalAscentM: number;
  totalDescentM: number;
  minElevationM: number;
  maxElevationM: number;
  profile: ElevationProfilePoint[];
};

const MIN_VALID_POINTS = 3;
const MIN_ELEVATION_DELTA_M = 3;

function validElevation(value: number | undefined): value is number {
  return value != null && Number.isFinite(value) && value > -500 && value < 9000;
}

function smoothProfile(points: ElevationProfilePoint[]): ElevationProfilePoint[] {
  return points.map((point, index) => {
    const from = Math.max(0, index - 2);
    const to = Math.min(points.length - 1, index + 2);
    let sum = 0;
    let count = 0;
    for (let i = from; i <= to; i++) {
      sum += points[i].elevationM;
      count++;
    }
    return { ...point, elevationM: sum / count };
  });
}

/**
 * 총 상승/하강고도 — 히스테리시스(대기 후 확정) 방식.
 * 인접 포인트 델타에 노이즈 문턱값을 바로 적용하면, GPS 포인트가 촘촘한 실측 데이터에서
 * 완만한 오르막이 포인트당 1m 미만 델타로 쪼개져 전부 버려진다(합계가 0이 되는 회귀 발견됨).
 * 대신 마지막으로 확정된 저점/고점에서 현재 극값까지의 누적 변화를 들고 있다가,
 * 반대 방향으로 문턱값 이상 꺾일 때만 그 구간을 확정한다.
 */
function ascentDescent(smoothed: ElevationProfilePoint[]): { totalAscentM: number; totalDescentM: number } {
  let totalAscentM = 0;
  let totalDescentM = 0;
  let base = smoothed[0].elevationM;
  let extreme = smoothed[0].elevationM;
  let direction: 1 | -1 | 0 = 0;

  function commit() {
    const segment = extreme - base;
    if (segment > 0) totalAscentM += segment;
    else if (segment < 0) totalDescentM += -segment;
  }

  for (let i = 1; i < smoothed.length; i++) {
    const e = smoothed[i].elevationM;
    if (direction >= 0 && e >= extreme) {
      extreme = e;
      direction = 1;
    } else if (direction <= 0 && e <= extreme) {
      extreme = e;
      direction = -1;
    } else if (Math.abs(e - extreme) >= MIN_ELEVATION_DELTA_M) {
      // 확정 문턱값을 넘는 반전 — 지금까지의 구간을 확정하고 새 추세 시작
      commit();
      base = extreme;
      extreme = e;
      direction = e > base ? 1 : -1;
    }
    // else: 문턱값 미만으로 벗어난 노이즈 — extreme 유지, 계속 지켜봄
  }
  commit();
  return { totalAscentM, totalDescentM };
}

export function computeElevationStats(path: LatLng[]): ElevationStats | null {
  const segments: ElevationProfilePoint[][] = [[]];
  let distanceM = 0;

  for (let i = 0; i < path.length; i++) {
    if (i > 0) {
      if (isPathBreak(path[i - 1], path[i])) {
        segments.push([]);
      } else {
        distanceM += creditedSegmentMeters(path[i - 1], path[i]);
      }
    }
    const elevationM = path[i].ele;
    if (validElevation(elevationM)) {
      segments[segments.length - 1].push({ distanceM, elevationM });
    }
  }

  // 단절 양쪽을 하나의 스무딩 창·상승/하강 추세로 합치면 일시정지 중 위치·고도 이동이
  // 실제 등반으로 잡힌다. 각 연속 구간을 독립적으로 평활·집계한다.
  const smoothedSegments = segments
    .filter((segment) => segment.length >= MIN_VALID_POINTS)
    .map(smoothProfile);
  if (smoothedSegments.length === 0) return null;

  let totalAscentM = 0;
  let totalDescentM = 0;
  let minElevationM = smoothedSegments[0][0].elevationM;
  let maxElevationM = smoothedSegments[0][0].elevationM;
  for (const segment of smoothedSegments) {
    const delta = ascentDescent(segment);
    totalAscentM += delta.totalAscentM;
    totalDescentM += delta.totalDescentM;
    for (const point of segment) {
      minElevationM = Math.min(minElevationM, point.elevationM);
      maxElevationM = Math.max(maxElevationM, point.elevationM);
    }
  }

  if (maxElevationM - minElevationM < 1) return null;

  return {
    totalAscentM,
    totalDescentM,
    minElevationM,
    maxElevationM,
    profile: smoothedSegments.flat(),
  };
}
