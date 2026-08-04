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
/**
 * GPS 수직 오차가 이보다 크면 고도를 기록하지 않는다.
 * 명백한 쓰레기(콜드스타트 수렴 전 30~80m대)만 거르는 느슨한 선 — 실기기는 야외에서도
 * 15~30m를 일상적으로 보고하므로 더 조이면 고도 샘플이 통째로 버려져 차트가 망가진다
 * (실측 회귀). 중간 품질 노이즈는 표시 단계의 중앙값·경사 클램프가 처리한다.
 * 앱의 약한 GPS 판정선(GPS_ACCURACY_PAUSE_M=30)과 같은 값.
 */
const MAX_VERTICAL_ACCURACY_M = 30;
/** 수직 정확도 미제공 기기는 수평 정확도로 대신 거른다(수직 오차는 통상 수평의 2~3배). */
const MAX_HORIZONTAL_ACCURACY_FALLBACK_M = 30;
/**
 * 거리 리샘플 버킷 폭. 짧은 런은 25m 고정, 긴 런은 총거리/400으로 넓혀 포인트 수를 억제.
 * 25m(1Hz 조깅 기준 샘플 ~15개)는 버킷 중앙값이 상관 드리프트까지 상당 부분 누르는 폭이다.
 */
const RESAMPLE_MIN_BUCKET_M = 25;
const RESAMPLE_TARGET_BUCKETS = 400;

/**
 * 중앙값·평활 창의 최대 폭(m)과, 총거리 대비 상한 비율.
 *
 * 창을 거리 고정값으로만 잡으면 짧은 코스에서 창 하나가 경로의 상당 부분을 덮어
 * 실제 지형이 통째로 뭉개진다(실측 회귀: 1km 걷기의 200m·6m 굴다리 딥이 잔여 깊이
 * 0.1m로 소멸 — 같은 필터로 3km 코스는 보존율 90%+). GPS 노이즈를 누르는 데 필요한
 * 창은 거리 스케일로 정해지지만, 그 창이 경로를 지배하면 안 되므로 비율 상한을 함께 건다.
 */
const MEDIAN_WINDOW_MAX_M = 125;
const MEDIAN_WINDOW_MAX_FRACTION = 1 / 16;
const SMOOTH_WINDOW_MAX_M = 175;
const SMOOTH_WINDOW_MAX_FRACTION = 1 / 12;

/** 창 폭(m)을 버킷 개수 기준 반경으로 환산한다(최소 1 — 창을 아예 없애진 않는다). */
function windowRadius(totalDistanceM: number, bucketM: number, maxM: number, maxFraction: number): number {
  const windowM = Math.min(maxM, Math.max(bucketM, totalDistanceM * maxFraction));
  return Math.max(1, Math.round((windowM / bucketM - 1) / 2));
}

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

/** 이동 중앙값. 몇 버킷짜리 스파이크는 제거하고 완만한 경사 추세는 보존한다. */
function rollingMedian(points: ElevationProfilePoint[], radius: number): ElevationProfilePoint[] {
  if (points.length < 3) return points;
  return points.map((point, index) => {
    const from = Math.max(0, index - radius);
    const to = Math.min(points.length - 1, index + radius);
    return {
      ...point,
      elevationM: median(points.slice(from, to + 1).map((p) => p.elevationM)),
    };
  });
}

/** 러닝 코스에서 물리적으로 가능한 최대 경사(30%). 이를 넘는 고도 변화는 GPS 오차다. */
const MAX_RUN_GRADE = 0.3;
/** 세그먼트 시작 후 이 거리까지는 후방 클램프(수렴 이후 데이터 기준)를 우선 신뢰한다. */
const COLD_START_TRUST_M = 300;

function gradeClampForward(points: ElevationProfilePoint[]): number[] {
  const out = new Array<number>(points.length);
  out[0] = points[0].elevationM;
  for (let i = 1; i < points.length; i++) {
    const maxDelta = MAX_RUN_GRADE * Math.max(1, points[i].distanceM - points[i - 1].distanceM);
    const prev = out[i - 1];
    out[i] = Math.min(prev + maxDelta, Math.max(prev - maxDelta, points[i].elevationM));
  }
  return out;
}

function gradeClampBackward(points: ElevationProfilePoint[]): number[] {
  const n = points.length;
  const out = new Array<number>(n);
  out[n - 1] = points[n - 1].elevationM;
  for (let i = n - 2; i >= 0; i--) {
    const maxDelta = MAX_RUN_GRADE * Math.max(1, points[i + 1].distanceM - points[i].distanceM);
    const next = out[i + 1];
    out[i] = Math.min(next + maxDelta, Math.max(next - maxDelta, points[i].elevationM));
  }
  return out;
}

/**
 * 콜드스타트 고도 드리프트 억제. 러닝에서 불가능한 경사(30% 초과)를 양방향 클램프로
 * 깎되, 세그먼트 시작 300m까지는 후방 클램프를 우선한다 — GPS 고도는 시작(재개) 직후가
 * 가장 부정확하고, 수렴 이후 데이터에서 되짚어야 그 오차가 드러난다.
 * 30% 이하의 실제 언덕은 두 클램프 모두 원본을 그대로 통과시키므로 영향이 없다.
 */
function suppressColdStartDrift(points: ElevationProfilePoint[]): ElevationProfilePoint[] {
  if (points.length < 3) return points;
  const forward = gradeClampForward(points);
  const backward = gradeClampBackward(points);
  const startM = points[0].distanceM;
  return points.map((point, i) => {
    const rel = point.distanceM - startM;
    const backwardWeight = rel >= COLD_START_TRUST_M ? 0.5 : 1 - (rel / COLD_START_TRUST_M) * 0.5;
    return {
      ...point,
      elevationM: backward[i] * backwardWeight + forward[i] * (1 - backwardWeight),
    };
  });
}

function smoothProfile(points: ElevationProfilePoint[], radius: number): ElevationProfilePoint[] {
  return points.map((point, index) => {
    const from = Math.max(0, index - radius);
    const to = Math.min(points.length - 1, index + radius);
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
  // 창 폭은 세그먼트가 아니라 총 거리 기준 — 버킷 폭과 같은 이유로 런 안에서 하나로 고정한다.
  const medianRadius = windowRadius(distanceM, bucketM, MEDIAN_WINDOW_MAX_M, MEDIAN_WINDOW_MAX_FRACTION);
  const smoothRadius = windowRadius(distanceM, bucketM, SMOOTH_WINDOW_MAX_M, SMOOTH_WINDOW_MAX_FRACTION);
  const smoothedSegments = segments
    .filter((segment) => segment.length >= MIN_VALID_POINTS)
    .map((segment) =>
      smoothProfile(
        suppressColdStartDrift(rollingMedian(resampleByDistance(segment, bucketM), medianRadius)),
        smoothRadius,
      ),
    );
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
