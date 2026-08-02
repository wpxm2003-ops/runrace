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
/** GPS 수직 오차가 이보다 크면 고도를 기록하지 않는다(콜드스타트 수렴 전 값이 주로 걸림). */
const MAX_VERTICAL_ACCURACY_M = 15;
/** 수직 정확도 미제공 기기는 수평 정확도로 대신 거른다(수직 오차는 통상 수평의 2~3배). */
const MAX_HORIZONTAL_ACCURACY_FALLBACK_M = 20;
/** 거리 리샘플 버킷 폭. 짧은 런은 10m 고정, 긴 런은 총거리/400으로 넓혀 포인트 수를 억제. */
const RESAMPLE_MIN_BUCKET_M = 10;
const RESAMPLE_TARGET_BUCKETS = 400;

function validElevation(value: number | undefined): value is number {
  return value != null && Number.isFinite(value) && value > -500 && value < 9000;
}

/**
 * 기록 시점의 고도 신뢰 판정. GPS 고도는 수평보다 오차가 크고 수렴도 늦어서,
 * 정확도가 나쁜 샘플을 그대로 쌓으면 평지 코스가 산길처럼 그려진다(실측 회귀).
 * 신뢰할 수 없으면 undefined — 포인트에 ele를 싣지 않는다.
 */
export function trustedAltitude(
  altitude: number | null | undefined,
  altitudeAccuracyM: number | null,
  horizontalAccuracyM: number | null,
): number | undefined {
  if (altitude == null || !Number.isFinite(altitude)) return undefined;
  if (altitudeAccuracyM != null) {
    return altitudeAccuracyM <= MAX_VERTICAL_ACCURACY_M ? altitude : undefined;
  }
  if (horizontalAccuracyM != null && horizontalAccuracyM > MAX_HORIZONTAL_ACCURACY_FALLBACK_M) {
    return undefined;
  }
  return altitude;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * 시간 기반 GPS 샘플을 거리 버킷당 한 점(버킷 내 중앙값)으로 리샘플한다.
 * 1Hz 샘플을 그대로 그리면 저속 구간(출발 직후·신호 대기)에 노이즈 샘플이 밀집해
 * 그 구간만 유난히 험하게 보인다 — 거리 기준으로 고르게 편 뒤 중앙값으로 지터를 거른다.
 */
function resampleByDistance(
  profile: ElevationProfilePoint[],
  bucketM: number,
): ElevationProfilePoint[] {
  const buckets = new Map<number, { distances: number[]; elevations: number[] }>();
  for (const point of profile) {
    const index = Math.floor(point.distanceM / bucketM);
    const bucket = buckets.get(index) ?? { distances: [], elevations: [] };
    bucket.distances.push(point.distanceM);
    bucket.elevations.push(point.elevationM);
    buckets.set(index, bucket);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, bucket]) => ({
      distanceM: bucket.distances.reduce((sum, d) => sum + d, 0) / bucket.distances.length,
      elevationM: median(bucket.elevations),
    }));
}

/** 버킷 하나를 통째로 오염시킨 단발 스파이크 제거(중앙값-of-3). 양 끝점은 그대로 둔다. */
function suppressSpikes(points: ElevationProfilePoint[]): ElevationProfilePoint[] {
  if (points.length < 3) return points;
  return points.map((point, i) => {
    if (i === 0 || i === points.length - 1) return point;
    return {
      ...point,
      elevationM: median([points[i - 1].elevationM, point.elevationM, points[i + 1].elevationM]),
    };
  });
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
  // 실제 등반으로 잡힌다. 각 연속 구간을 독립적으로 리샘플·평활·집계한다.
  // 버킷 폭은 총 거리 기준 하나로 고정 — 구간마다 달라지면 같은 런 안에서 해상도가 어긋난다.
  const bucketM = Math.max(RESAMPLE_MIN_BUCKET_M, distanceM / RESAMPLE_TARGET_BUCKETS);
  const smoothedSegments = segments
    .filter((segment) => segment.length >= MIN_VALID_POINTS)
    .map((segment) => smoothProfile(suppressSpikes(resampleByDistance(segment, bucketM))));
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
