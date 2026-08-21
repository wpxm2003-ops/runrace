/**
 * lat/lng에 러닝 시작 후 경과 ms(t)를 함께 저장한다. 구형 기록은 t가 없을 수 있다.
 * breakBefore는 일시정지·GPS 복구 뒤 첫 점처럼 직전 점과 거리를 이어서는 안 되는
 * 명시적 경로 단절이다. 거리와 무관하게 서버 왕복 후에도 보존한다.
 */
export type LatLng = {
  lat: number;
  lng: number;
  t?: number;
  breakBefore?: boolean;
};

export type WorkoutStatus = "idle" | "running" | "paused";

export type WorkoutFinishSnapshot = {
  clientWorkoutId: string;
  startedAt: string;
  /** 시작 시각의 기기 벽시계(타임존 없음) — 서버가 날짜 집계 기준으로 박제한다. */
  startedAtLocal: string;
  endedAt: string;
  durationSec: number;
  distanceM: number;
  calories: number;
  avgPaceSecPerKm: number | null;
  path: LatLng[];
};

/** 운동 시작 직전 GPS 예열에서 얻은 위치 후보. */
export type WorkoutStartFix = {
  ownerUid: string;
  lat: number;
  lng: number;
  accuracyM: number | null;
  /** 위치 제공자가 실제로 측정한 벽시계 시각. */
  fixAtMs: number;
  /** 앱이 콜백을 받은 벽시계 시각. */
  receivedAtMs: number;
};

/** 시작점으로 재사용할 수 있는 예열 좌표의 최대 나이. */
// 버튼 후 GO까지 2.7초이므로, 버튼 직전에 받은 fix도 여유 있게 유효해야 한다.
export const WORKOUT_START_FIX_MAX_AGE_MS = 5_000;
/** 시작점은 차량 감지의 "양호 GPS" 기준과 같은 정확도만 허용한다. */
export const WORKOUT_START_FIX_MAX_ACCURACY_M = 20;

/**
 * 시작 시각에 가장 가까운 양호한 예열 좌표 한 점만 고른다.
 * 예열 후보들 사이의 이동은 더하지 않고 반환한 한 점을 t=0 기준점으로만 사용한다.
 */
export function pickWorkoutStartSeed(
  fixes: readonly WorkoutStartFix[],
  ownerUid: string,
  startedAtMs: number,
  maxAgeMs: number = WORKOUT_START_FIX_MAX_AGE_MS,
): LatLng | null {
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(maxAgeMs) || maxAgeMs < 0) {
    return null;
  }

  for (let i = fixes.length - 1; i >= 0; i--) {
    const fix = fixes[i];
    const fixAgeMs = startedAtMs - fix.fixAtMs;
    const receiptAgeMs = startedAtMs - fix.receivedAtMs;
    if (
      fix.ownerUid !== ownerUid
      || !Number.isFinite(fix.lat)
      || fix.lat < -90
      || fix.lat > 90
      || !Number.isFinite(fix.lng)
      || fix.lng < -180
      || fix.lng > 180
      || fix.accuracyM == null
      || !Number.isFinite(fix.accuracyM)
      || fix.accuracyM < 0
      || fix.accuracyM > WORKOUT_START_FIX_MAX_ACCURACY_M
      || !Number.isFinite(fix.fixAtMs)
      || !Number.isFinite(fix.receivedAtMs)
      || fixAgeMs < 0
      || receiptAgeMs < 0
      || fixAgeMs > maxAgeMs
      || receiptAgeMs > maxAgeMs
    ) {
      continue;
    }
    return { lat: fix.lat, lng: fix.lng, t: 0 };
  }

  return null;
}

const MIN_MOVE_METERS = 4;
const EARTH_RADIUS_M = 6_371_000;

/**
 * 방치 자동 일시정지 — "운동 종료를 잊은" 세션 감지 전용.
 *
 * 이 창(기본 30분) 동안 누적 인정 거리와 최소 공간 폭을 함께 채우지 못하면
 * 러닝이 아니라 방치(귀가·탑승 후 미종료)로 보고 수동 일시정지와 같은 상태로 전환한다.
 * 재개는 사용자가 직접 한다(자동 재개 없음).
 *
 * 의도적으로 보수적인 기준이다 — 신호 대기·인터벌 휴식 같은 짧은 정지는 절대 걸리지
 * 않아야 한다. 짧은 정지가 활동시간에서 빠지면 PB·유령 비교의 기준이 "총 경과시간"에서
 * "이동시간"으로 조용히 바뀌어, 서서 쉬며 끊어 뛴 기록이 연속주 최고기록으로 등록되는
 * 오염이 생긴다(제품 결정: 총 경과시간 기준 유지).
 */
export const IDLE_AUTO_PAUSE_WINDOW_MS = 30 * 60_000;
/** 창 안에 이만큼도 못 나아가면 방치로 판정한다(가장 느린 산책도 30분에 1km+는 간다). */
export const IDLE_AUTO_PAUSE_MIN_PROGRESS_M = 100;
/** 누적 거리와 함께 요구할 최소 공간 폭 — 5~10m GPS 왕복 드리프트를 실제 이동과 구분한다. */
export const IDLE_AUTO_PAUSE_MIN_SPAN_M = 50;

type GeoPoint = { lat: number; lng: number };

/**
 * 방치 판정 기준점 — 마지막으로 충분한 이동이 확인된 시각·거리·공간 범위.
 * 단순 누적거리만 쓰면 GPS가 좁은 범위에서 왕복해도 창이 갱신되므로, 앵커 위치로부터
 * 관측된 최대 변위도 함께 보존한다.
 */
export type IdleAnchor = {
  timeMs: number;
  distanceM: number;
  position?: GeoPoint;
  maxDisplacementM?: number;
};

/**
 * 누적 인정거리 100m와 공간 폭 50m를 모두 채웠으면 창을 새로 시작한다.
 * 첫 양호한 fix는 시각을 바꾸지 않고 위치만 심는다. 50m 셔틀·작은 트랙은 살리면서,
 * 서로 5~10m 떨어진 GPS 오차점이 왕복해 누적 100m를 넘어도 창은 갱신하지 않는다.
 */
export function slideIdleAnchor(
  anchor: IdleAnchor,
  nowMs: number,
  distanceM: number,
  position: GeoPoint,
): IdleAnchor {
  if (!anchor.position) {
    return {
      ...anchor,
      position: { lat: position.lat, lng: position.lng },
      maxDisplacementM: 0,
    };
  }
  const maxDisplacementM = Math.max(
    anchor.maxDisplacementM ?? 0,
    haversineMeters(anchor.position, position),
  );
  if (
    distanceM - anchor.distanceM >= IDLE_AUTO_PAUSE_MIN_PROGRESS_M
    && maxDisplacementM >= IDLE_AUTO_PAUSE_MIN_SPAN_M
  ) {
    return {
      timeMs: nowMs,
      distanceM,
      position: { lat: position.lat, lng: position.lng },
      maxDisplacementM: 0,
    };
  }
  return maxDisplacementM === anchor.maxDisplacementM
    ? anchor
    : { ...anchor, maxDisplacementM };
}

/**
 * 방치 자동 일시정지 발동 시각. 창이 다 지나도록 기준 거리를 못 채웠으면 앵커 시각을
 * 반환한다 — 발동을 뒤늦게 감지해도(백그라운드 타이머 지연·앱 재시작) 일시정지가 그
 * 시각으로 소급돼 방치된 시간이 활동시간·페이스에 섞이지 않는다. 아직이면 null.
 */
export function idleAutoPauseAt(anchor: IdleAnchor, nowMs: number): number | null {
  return nowMs - anchor.timeMs >= IDLE_AUTO_PAUSE_WINDOW_MS ? anchor.timeMs : null;
}

/**
 * 카카오맵이 실제로 지도를 그려주는 범위(한반도 + 주변 도서).
 *
 * 지도 공급자를 언어로 고르면 안 되는 이유: 해외여행 중 뛴 한국어 사용자에게 카카오맵이 뜨는데
 * 국외는 타일이 없어 빈 화면이 된다. 라이브 화면뿐 아니라 기록 상세도 같은 컴포넌트라
 * 그 기록은 영구히 지도가 안 보인다. 언어가 아니라 좌표로 고른다.
 *
 * 단일 직사각형(33~39, 124~132)은 후쿠오카(33.6, 130.4)까지 한국으로 판정했다(실측 리뷰 지적).
 * 본토+제주(경도 129.7까지)와 울릉·독도만 따로 덮고, 본토 박스 남동쪽에 걸리는
 * 대마도(34.1~34.7, 129.2~129.5)는 명시적으로 제외한다.
 */
const KOREA_MAINLAND = { minLat: 33, maxLat: 38.75, minLng: 124.5, maxLng: 129.7 };
const KOREA_ULLEUNG_DOKDO = { minLat: 36.9, maxLat: 37.7, minLng: 130.6, maxLng: 132.0 };
// Hirado, Iki and Tsushima sit inside the coarse mainland rectangle but are in Japan.
const JAPAN_NORTHWEST_ISLANDS = {
  minLat: 33.0,
  maxLat: 34.85,
  minLng: 128.8,
  maxLng: 129.7,
};

function inBox(p: LatLng, b: { minLat: number; maxLat: number; minLng: number; maxLng: number }): boolean {
  return p.lat >= b.minLat && p.lat <= b.maxLat && p.lng >= b.minLng && p.lng <= b.maxLng;
}

export function isInKorea(point: LatLng): boolean {
  if (inBox(point, JAPAN_NORTHWEST_ISLANDS)) return false;
  return inBox(point, KOREA_MAINLAND) || inBox(point, KOREA_ULLEUNG_DOKDO);
}

export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function pathDistanceMeters(points: LatLng[]): number {
  let sum = 0;
  for (let i = 1; i < points.length; i++) {
    sum += haversineMeters(points[i - 1], points[i]);
  }
  return sum;
}

/**
 * 추적 끊김(연속 점 간 gapThresholdM 초과)을 직선으로 잇지 않는 누적 거리.
 * 세션 복원 시 저장된 거리가 없는 구형 스냅샷의 폴백 — 지하철·앱 종료 중 이동을
 * 거리에 합산하지 않는다(라이브 집계의 재정박과 같은 취지).
 */
export function creditedPathDistanceMeters(
  points: LatLng[],
  gapThresholdM: number = MAP_GAP_THRESHOLD_M,
): number {
  let sum = 0;
  for (let i = 1; i < points.length; i++) {
    sum += creditedSegmentMeters(points[i - 1], points[i], gapThresholdM);
  }
  return sum;
}

/** 연속 두 점 사이가 이 거리(m)를 넘으면 지도에서 추적 끊김(점선)으로 본다. */
export const MAP_GAP_THRESHOLD_M = 120;

/** 명시적 재정박 또는 큰 GPS 점프면 직전 점과 거리를 이어 계산하지 않는다. */
export function isPathBreak(
  previous: LatLng,
  current: LatLng,
  gapThresholdM: number = MAP_GAP_THRESHOLD_M,
): boolean {
  return current.breakBefore === true
    || haversineMeters(previous, current) > gapThresholdM;
}

/** 라이브 거리와 동일하게 경로 단절을 0m로 처리한 한 구간의 인정 거리. */
export function creditedSegmentMeters(
  previous: LatLng,
  current: LatLng,
  gapThresholdM: number = MAP_GAP_THRESHOLD_M,
): number {
  return isPathBreak(previous, current, gapThresholdM)
    ? 0
    : haversineMeters(previous, current);
}

export type PathSegments = { solidLines: LatLng[][]; gapLines: LatLng[][] };

/**
 * GPS 경로를 지도 렌더링용 실선(연속 구간)·점선(끊긴 구간)으로 분리한다.
 * 경로 포인트엔 시각이 없어 거리 점프 휴리스틱을 쓴다(백그라운드 추적 끊김 대응).
 * Kakao/Mapbox 지도 컴포넌트가 공용으로 사용한다.
 */
export function splitPathAtGaps(
  path: LatLng[],
  gapThresholdM: number = MAP_GAP_THRESHOLD_M,
): PathSegments {
  const solidLines: LatLng[][] = [];
  const gapLines: LatLng[][] = [];
  let run: LatLng[] = [];
  for (let i = 0; i < path.length; i++) {
    if (i === 0) { run = [path[0]]; continue; }
    if (isPathBreak(path[i - 1], path[i], gapThresholdM)) {
      if (run.length >= 2) solidLines.push(run);
      gapLines.push([path[i - 1], path[i]]);
      run = [path[i]];
    } else {
      run.push(path[i]);
    }
  }
  if (run.length >= 2) solidLines.push(run);
  return { solidLines, gapLines };
}

/** 지도 리렌더 판단용 캐시 키 — 경로 길이·시작점·끝점만 반영해 값이 같으면 재계산을 건너뛴다. */
export function pathBoundsKey(path: LatLng[]): string {
  if (path.length === 0) return "";
  const first = path[0];
  const last = path[path.length - 1];
  return `${path.length}:${first.lat},${first.lng}:${last.lat},${last.lng}`;
}

export function shouldAppendPoint(prev: LatLng | null, next: LatLng): boolean {
  if (!prev) return true;
  return haversineMeters(prev, next) >= MIN_MOVE_METERS;
}

// ── 탈것 Tiered + GPS 품질 (지하철·터널) ─────────────────────────────────────
export type VehicleTier =
  | "normal"
  | "suspect"
  | "confirmed"
  | "weak_gps"
  | "recovering";

/** 단순 Pause: accuracy(m) 초과 시 즉시 Weak (Grok/초기 권장 30m) */
const GPS_ACCURACY_PAUSE_M = 30;
/** 지속 Poor: 현재·5초 평균 모두 초과 시 Weak */
const GPS_ACCURACY_SUSTAINED_M = 25;
const GPS_ACCURACY_AVG_WINDOW_MS = 5_000;
/** 복귀 시 양호 GPS (들어갈 때보다 엄격 — 점프 방지) */
const GPS_ACCURACY_GOOD_M = WORKOUT_START_FIX_MAX_ACCURACY_M;
/** Weak/No-Fix 15초+ → confirmed(지하철 의심) */
const WEAK_GPS_FORCE_CONFIRM_MS = 15_000;
/** accuracy 나쁨 + 속도 ≥ 8km/h → 즉시 Weak (GPS·속도 모순) */
const GPS_SPEED_COMBO_KMH = 8;
const GPS_SPEED_COMBO_MS = (GPS_SPEED_COMBO_KMH * 1000) / 3600;

/** Suspect: 거리만 중단, GPS 경로는 계속 (~21 km/h) */
const SUSPECT_SPEED_MS = 5.8;
const SUSPECT_CONFIRM_MS = 2_500;
/** Confirmed: 경로·거리 완전 중단 (~23 km/h) */
const CONFIRMED_SPEED_MS = 6.5;
const CONFIRMED_CONFIRM_MS = 4_000;
/** 즉시 Confirmed (~32 km/h) */
const INSTANT_VEHICLE_SPEED_MS = 9;
/** Suspect/Confirmed 해제(이력) */
const VEHICLE_BAND_EXIT_MS = 5.0;
/** 복귀: 양호 GPS + 이 속도 이하가 8~10초 지속 (~14 km/h) */
const RECOVERY_MAX_SPEED_MS = 4.0;
/** 탈것(속도) 감지 후 복귀 — 치팅 위험이 있어 보수적으로 길게 확인. */
const RECOVERY_CONFIRM_MS = 5_000;
/**
 * GPS 끊김(터널·빌딩숲)만으로 weak였다가 복귀 — 탈것 속도가 감지된 적이 없어 치팅 위험이 낮다.
 * 복귀도 여전히 저속(≤14km/h)+양호 GPS를 요구하므로, 짧게 확인해 정직한 러너의 체감 렉만 줄인다.
 */
const RECOVERY_CONFIRM_WEAK_MS = 2_000;

/** 추후 심박·케이던스·도시 민감도 등 (현재 미연동) */
type VehicleSignals = {
  heartRateBpm?: number | null;
  cadenceSpm?: number | null;
  /** true면 Suspect/Confirmed 임계를 약간 낮춤 (도시 버스·지하철) */
  urbanSensitive?: boolean;
};

type AccuracySample = { atMs: number; accuracyM: number };

export type VehicleDetectState = {
  tier: VehicleTier;
  suspectHighSinceMs: number | null;
  confirmedHighSinceMs: number | null;
  lowSpeedSinceMs: number | null;
  weakGpsSinceMs: number | null;
  /** recovering일 때, GPS 끊김만으로 진입했는지(true=탈것 속도 미개입 → 빠른 복귀 허용). */
  recoveringFromWeakGps: boolean;
  /**
   * 이번 세션에서 양호한 GPS fix를 한 번이라도 받았는지.
   * false면 콜드스타트 예열 중 — 나쁜 정확도를 탈것/지하철로 오인해 승격하지 않고,
   * 첫 양호 fix가 오면 복구 절차 없이 즉시 정상 기록으로 넘어간다.
   */
  hasHadGoodFix: boolean;
  accuracyRecent: AccuracySample[];
};

type VehicleDetectInput = {
  speedMps: number | null;
  /** Geolocation accuracy (m), iOS horizontalAccuracy / Android getAccuracy */
  accuracyM: number | null;
  nowMs: number;
  state: VehicleDetectState;
  signals?: VehicleSignals;
};

type VehicleDetectResult = {
  tier: VehicleTier;
  blockDistance: boolean;
  blockPathPoints: boolean;
  /** recovering → normal 직후 첫 점: 거리 0, 시간은 유지 */
  reanchorNextPoint: boolean;
  suspectHighSinceMs: number | null;
  confirmedHighSinceMs: number | null;
  lowSpeedSinceMs: number | null;
  weakGpsSinceMs: number | null;
  recoveringFromWeakGps: boolean;
  hasHadGoodFix: boolean;
  accuracyRecent: AccuracySample[];
};

/**
 * Geolocation accuracy 정규화.
 * iOS CLLocation.horizontalAccuracy -1, 무효/미제공은 null.
 */
export function normalizeGpsAccuracyM(
  raw: number | null | undefined,
): number | null {
  if (raw == null || !Number.isFinite(raw) || raw < 0) return null;
  return raw;
}

export function pushAccuracySample(
  samples: AccuracySample[],
  nowMs: number,
  accuracyM: number | null,
  maxAgeMs: number = GPS_ACCURACY_AVG_WINDOW_MS,
): AccuracySample[] {
  const next =
    accuracyM != null ? [...samples, { atMs: nowMs, accuracyM }] : [...samples];
  return next.filter((s) => nowMs - s.atMs <= maxAgeMs);
}

function averageAccuracyM(samples: AccuracySample[]): number | null {
  if (samples.length === 0) return null;
  return samples.reduce((sum, s) => sum + s.accuracyM, 0) / samples.length;
}

/**
 * Weak GPS 판정 (미터, iOS/Android 동일 비교).
 * 1) No Fix  2) >30m 즉시  3) >25m + 5초 평균 >25m  4) >25m + 속도 ≥8km/h
 */
function isGpsWeak(
  accuracyM: number | null,
  speedMps: number | null,
  recentSamples: AccuracySample[],
): boolean {
  if (accuracyM == null && speedMps == null) return true;

  if (accuracyM != null && accuracyM > GPS_ACCURACY_PAUSE_M) return true;

  const avg = averageAccuracyM(recentSamples);
  if (
    accuracyM != null &&
    accuracyM > GPS_ACCURACY_SUSTAINED_M &&
    avg != null &&
    avg > GPS_ACCURACY_SUSTAINED_M
  ) {
    return true;
  }

  if (
    accuracyM != null &&
    accuracyM > GPS_ACCURACY_SUSTAINED_M &&
    speedMps != null &&
    speedMps >= GPS_SPEED_COMBO_MS
  ) {
    return true;
  }

  return false;
}

function isGpsGood(accuracyM: number | null): boolean {
  return accuracyM != null && accuracyM <= GPS_ACCURACY_GOOD_M;
}

function urbanFactor(signals?: VehicleSignals): number {
  return signals?.urbanSensitive ? 0.92 : 1;
}

function effectiveThreshold(base: number, signals?: VehicleSignals): number {
  return base * urbanFactor(signals);
}

/**
 * GPS 품질 우선 → Tiered 속도 감지 → Recovering(양호 GPS+저속) → normal.
 */
export function evaluateVehicleTier(input: VehicleDetectInput): VehicleDetectResult {
  const { speedMps, accuracyM, nowMs, state, signals } = input;
  const { tier, accuracyRecent, recoveringFromWeakGps } = state;
  let {
    suspectHighSinceMs,
    confirmedHighSinceMs,
    lowSpeedSinceMs,
    weakGpsSinceMs,
  } = state;

  const suspectMs = effectiveThreshold(SUSPECT_SPEED_MS, signals);
  const confirmedMs = effectiveThreshold(CONFIRMED_SPEED_MS, signals);
  const instantMs = INSTANT_VEHICLE_SPEED_MS;
  const exitMs = effectiveThreshold(VEHICLE_BAND_EXIT_MS, signals);
  const recoveryMs = RECOVERY_MAX_SPEED_MS;

  // 콜드스타트 예열 상태. weak = 이번 fix가 약한 GPS인지. hasHadGoodFix가 한 번 true가 되면
  // 이후로는 계속 유지된다. firstGoodFix = 예열 완료로 넘어가는 바로 그 fix.
  const weak = isGpsWeak(accuracyM, speedMps, accuracyRecent);
  const hasHadGoodFix = state.hasHadGoodFix || !weak;
  const firstGoodFix = !weak && !state.hasHadGoodFix;

  const result = (
    partial: Partial<VehicleDetectResult> & Pick<VehicleDetectResult, "tier">,
  ): VehicleDetectResult => ({
    blockDistance: partial.blockDistance ?? partial.tier !== "normal",
    blockPathPoints:
      partial.blockPathPoints ??
      (partial.tier === "confirmed" ||
        partial.tier === "recovering" ||
        partial.tier === "weak_gps"),
    reanchorNextPoint: partial.reanchorNextPoint ?? false,
    suspectHighSinceMs: partial.suspectHighSinceMs ?? suspectHighSinceMs,
    confirmedHighSinceMs: partial.confirmedHighSinceMs ?? confirmedHighSinceMs,
    lowSpeedSinceMs: partial.lowSpeedSinceMs ?? lowSpeedSinceMs,
    weakGpsSinceMs: partial.weakGpsSinceMs ?? weakGpsSinceMs,
    recoveringFromWeakGps: partial.recoveringFromWeakGps ?? recoveringFromWeakGps,
    hasHadGoodFix: partial.hasHadGoodFix ?? hasHadGoodFix,
    accuracyRecent: partial.accuracyRecent ?? accuracyRecent,
    tier: partial.tier,
  });

  const hold = (): VehicleDetectResult =>
    result({
      tier,
      blockDistance: tier !== "normal",
      blockPathPoints:
        tier === "confirmed" || tier === "recovering" || tier === "weak_gps",
    });

  // ── 1) GPS 약함 / No Fix (지하철·터널) ───────────────────────────────────
  if (weak) {
    weakGpsSinceMs = weakGpsSinceMs ?? nowMs;
    // 예열 중(첫 양호 fix 전)엔 15초를 넘겨도 탈것으로 승격하지 않는다 — 아직 기록할 러닝이
    // 없고, 정상적인 콜드스타트 GPS 확보 지연을 지하철로 오인하면 안 된다.
    if (
      state.hasHadGoodFix &&
      nowMs - weakGpsSinceMs >= WEAK_GPS_FORCE_CONFIRM_MS
    ) {
      return result({
        tier: "confirmed",
        blockDistance: true,
        blockPathPoints: true,
        weakGpsSinceMs,
        suspectHighSinceMs: suspectHighSinceMs ?? nowMs,
        confirmedHighSinceMs: confirmedHighSinceMs ?? nowMs,
        lowSpeedSinceMs: null,
      });
    }
    return result({
      tier: "weak_gps",
      blockDistance: true,
      blockPathPoints: true,
      weakGpsSinceMs,
    });
  }
  weakGpsSinceMs = null;

  if (tier === "weak_gps") {
    // 콜드스타트 예열 완료(첫 양호 fix) — 복구 절차 없이 즉시 정상 기록 시작.
    // 아직 러닝을 기록한 적이 없으므로 복구 대기(5초)로 초반을 더 깎을 이유가 없다.
    if (firstGoodFix) {
      return result({
        tier: "normal",
        blockDistance: false,
        blockPathPoints: false,
        reanchorNextPoint: true,
        suspectHighSinceMs: null,
        confirmedHighSinceMs: null,
        lowSpeedSinceMs: null,
        weakGpsSinceMs: null,
        recoveringFromWeakGps: false,
      });
    }
    return result({
      tier: "recovering",
      blockDistance: true,
      blockPathPoints: true,
      suspectHighSinceMs: null,
      confirmedHighSinceMs: null,
      recoveringFromWeakGps: true, // GPS만 끊겼던 복귀 → 빠른 복귀 대상
      lowSpeedSinceMs:
        speedMps != null && speedMps <= recoveryMs ? nowMs : null,
    });
  }

  // ── 2) Recovering: 양호 GPS + 저속 ───────────────────────────────────────
  if (tier === "recovering") {
    const speedOk = speedMps != null && speedMps <= recoveryMs;
    const gpsOk = isGpsGood(accuracyM);
    // GPS 끊김만으로 진입한 복귀는 치팅 위험이 낮아 짧게 확인(속도·GPS 조건은 동일).
    const confirmMs = recoveringFromWeakGps ? RECOVERY_CONFIRM_WEAK_MS : RECOVERY_CONFIRM_MS;
    if (speedOk && gpsOk) {
      if (lowSpeedSinceMs == null) lowSpeedSinceMs = nowMs;
      if (nowMs - lowSpeedSinceMs >= confirmMs) {
        return result({
          tier: "normal",
          blockDistance: false,
          blockPathPoints: false,
          reanchorNextPoint: true,
          suspectHighSinceMs: null,
          confirmedHighSinceMs: null,
          lowSpeedSinceMs: null,
          weakGpsSinceMs: null,
          recoveringFromWeakGps: false,
        });
      }
    } else {
      lowSpeedSinceMs = null;
    }
    return result({
      tier: "recovering",
      blockDistance: true,
      blockPathPoints: true,
      lowSpeedSinceMs,
    });
  }

  if (speedMps == null) {
    return hold();
  }

  // ── 3) Instant / Confirmed (지상 탈것) ───────────────────────────────────
  if (speedMps >= instantMs) {
    return result({
      tier: "confirmed",
      blockDistance: true,
      blockPathPoints: true,
      suspectHighSinceMs: suspectHighSinceMs ?? nowMs,
      confirmedHighSinceMs: confirmedHighSinceMs ?? nowMs,
      lowSpeedSinceMs: null,
    });
  }

  if (speedMps >= confirmedMs) {
    if (confirmedHighSinceMs == null) confirmedHighSinceMs = nowMs;
    if (nowMs - confirmedHighSinceMs >= CONFIRMED_CONFIRM_MS) {
      return result({
        tier: "confirmed",
        blockDistance: true,
        blockPathPoints: true,
        suspectHighSinceMs: suspectHighSinceMs ?? confirmedHighSinceMs,
        confirmedHighSinceMs,
        lowSpeedSinceMs: null,
      });
    }
  } else {
    confirmedHighSinceMs = null;
  }

  // ── 4) Suspect ───────────────────────────────────────────────────────────
  if (speedMps > suspectMs) {
    if (suspectHighSinceMs == null) suspectHighSinceMs = nowMs;
    const suspectReady = nowMs - suspectHighSinceMs >= SUSPECT_CONFIRM_MS;
    if (suspectReady) {
      return result({
        tier: "suspect",
        blockDistance: true,
        blockPathPoints: false,
        suspectHighSinceMs,
        confirmedHighSinceMs,
        lowSpeedSinceMs: null,
      });
    }
    return result({
      tier: "normal",
      blockDistance: true,
      blockPathPoints: false,
      suspectHighSinceMs,
      confirmedHighSinceMs,
      lowSpeedSinceMs: null,
    });
  }

  // ── 5) Confirmed / Suspect → Recovering ──────────────────────────────────
  if (tier === "confirmed" || tier === "suspect") {
    if (speedMps < exitMs) {
      return result({
        tier: "recovering",
        blockDistance: true,
        blockPathPoints: true,
        suspectHighSinceMs: null,
        confirmedHighSinceMs: null,
        recoveringFromWeakGps: false, // 탈것 속도가 감지됐던 복귀 → 보수적(긴) 확인
        lowSpeedSinceMs: speedMps <= recoveryMs ? nowMs : null,
      });
    }
    return hold();
  }

  suspectHighSinceMs = null;
  return result({
    tier: "normal",
    blockDistance: false,
    blockPathPoints: false,
    suspectHighSinceMs: null,
    confirmedHighSinceMs: null,
    lowSpeedSinceMs: null,
    weakGpsSinceMs: null,
    recoveringFromWeakGps: false,
  });
}

/**
 * **시계 표기** — 초 → "H:MM:SS"(1시간 미만은 분 0패딩 "MM:SS", 예: 303초 → "05:03"). 음수는 0으로 클램프.
 *
 * 폭이 고정돼야 하는 곳에 쓴다: 1초마다 갱신되는 러닝 중 타이머(무패딩이면 9:59→10:00에서
 * 글자 수가 바뀌어 레이아웃이 튄다), 스탯 그리드·목록처럼 세로로 줄 맞춤이 필요한 표기.
 *
 * ⚠️ 기록 값(개인 최고, 완주 예상, 격차)은 이쪽이 아니라 {@link import("./paceMath").formatHms}
 * (분 무패딩 "5:03" — 레이스 결과 표기법)를 쓴다. 사본을 새로 만들지 말 것.
 */
export function formatClock(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

/** 거리(km) 기준 대략 칼로리 (체중 65kg 러닝 가정) */
export function estimateCalories(distanceM: number): number {
  const km = distanceM / 1000;
  return Math.round(km * 65);
}

/**
 * GPS 실패 사유. 문구가 아니라 코드를 돌려준다 — 이 모듈은 로케일을 모르는데
 * 예전에는 한국어 문장을 그대로 반환해, 어떤 언어를 쓰든 위치 오류 배너만 한국어로 떴다.
 * 문구 매핑은 화면 계층(useWorkoutSession의 geoMessages)이 담당한다.
 */
export type GeoErrorCode = "unavailable" | "insecure" | "permission" | "timeout" | "unknown";

/** http://IP 등 비보안 페이지에서는 Geolocation API 사용 불가 */
export function geolocationBlockedCode(): GeoErrorCode | null {
  if (typeof window === "undefined") return null;
  if (!navigator.geolocation) return "unavailable";
  if (!window.isSecureContext) return "insecure";
  return null;
}

export const GPS_WATCHDOG_TIMEOUT_MS = 15_000;
/**
 * After this long without a GPS callback while Android was backgrounded, the
 * app cannot distinguish a genuine rest from a suspended WebView bridge. Do
 * not turn that unknown gap into a false "idle" auto-pause when it returns.
 */
export const GPS_FOREGROUND_RECOVERY_GAP_MS = 30_000;

/** A running foreground watch is stale when neither startup nor the last fix is recent. */
export function shouldRestartGpsWatch(
  nowMs: number,
  watchStartedAtMs: number | null,
  lastFixAtMs: number | null,
  timeoutMs: number = GPS_WATCHDOG_TIMEOUT_MS,
): boolean {
  if (watchStartedAtMs == null) return true;
  const lastActivityAtMs = Math.max(watchStartedAtMs, lastFixAtMs ?? 0);
  return nowMs - lastActivityAtMs >= timeoutMs;
}

/** Whether a foreground return has an unobservable GPS gap that must reset the idle anchor. */
export function shouldResetIdleAnchorAfterForegroundGap(
  nowMs: number,
  lastFixAtMs: number | null,
  maxGapMs: number = GPS_FOREGROUND_RECOVERY_GAP_MS,
): boolean {
  if (!Number.isFinite(nowMs) || !Number.isFinite(maxGapMs) || maxGapMs < 0) return false;
  if (lastFixAtMs == null || !Number.isFinite(lastFixAtMs)) return true;
  return nowMs - lastFixAtMs >= maxGapMs;
}

export type KmSplit = {
  km: number;
  distanceM: number;
  paceSec: number;
  /** 이전 구간 대비 페이스 차(초). 양수 = 느려짐, 음수 = 빨라짐. 첫 구간은 null. */
  paceChange: number | null;
};

/**
 * 경로 포인트에서 km 구간별 페이스를 계산한다.
 * t(경과 ms)가 없는 구형 기록은 빈 배열을 반환한다.
 * 마지막 미완 구간은 100m 이상일 때만 포함한다.
 */
export function computeKmSplits(path: LatLng[]): KmSplit[] {
  const pts = path.filter((p) => p.t != null);
  if (pts.length < 2) return [];

  const splits: KmSplit[] = [];
  let kmIndex = 1;
  let kmStartM = 0;
  let tStart = pts[0].t!;
  let cumM = 0;

  for (let i = 1; i < pts.length; i++) {
    // 명시적 재정박·추적 끊김(>120m) 구간은 거리 0으로 취급 — 라이브 거리 집계와 일치시키고,
    // 끊김을 직선으로 이어 구간 페이스가 실제보다 빨라지는 것을 막는다(시간은 흐른 대로 반영).
    const seg = creditedSegmentMeters(pts[i - 1], pts[i]);
    const tPrev = pts[i - 1].t!;
    const tCurr = pts[i].t!;
    const prevCumM = cumM;
    cumM += seg;

    while (cumM >= kmIndex * 1000) {
      const targetM = kmIndex * 1000;
      const frac = seg > 0 ? (targetM - prevCumM) / seg : 1;
      const tAtKm = tPrev + frac * (tCurr - tPrev);
      const paceSec = (tAtKm - tStart) / 1000;
      const prev = splits[splits.length - 1] ?? null;
      splits.push({ km: kmIndex, distanceM: 1000, paceSec, paceChange: prev ? paceSec - prev.paceSec : null });
      kmStartM = targetM;
      tStart = tAtKm;
      kmIndex++;
    }
  }

  const lastM = cumM - kmStartM;
  if (lastM >= 100 && splits.length > 0) {
    const tEnd = pts[pts.length - 1].t!;
    const paceSec = lastM > 0 ? ((tEnd - tStart) / 1000) / (lastM / 1000) : 0;
    const prev = splits[splits.length - 1];
    splits.push({ km: kmIndex, distanceM: Math.round(lastM), paceSec, paceChange: paceSec - prev.paceSec });
  }

  return splits;
}

const PB_TARGETS = [
  { key: "3k", m: 3_000 },
  { key: "5k", m: 5_000 },
  { key: "10k", m: 10_000 },
  { key: "half", m: 21_097 },
  { key: "marathon", m: 42_195 },
] as const;

/**
 * 경로에서 각 목표 거리(5k/10k/하프/마라톤)의 최고 구간 페이스(초/km)를 반환한다.
 * 슬라이딩 윈도우 O(n) 알고리즘. t 없는 구형 경로는 빈 객체 반환.
 * 서버에 전송해 PB 판정에 사용한다.
 */
export function computeBestSegments(path: LatLng[]): Record<string, number> {
  const pts = path.filter((p) => p.t != null);
  if (pts.length < 2) return {};

  // 명시적 재정박·추적 끊김(>120m)을 가로지르는 윈도우 금지 — 지하철·일시정지 중 이동을 직선으로 이으면
  // 비현실적으로 빠른 구간이 만들어져 가짜 PB가 서버에 등록된다(PB→NSM·유령까지 오염).
  // 끊김 없는 연속 구간별로만 최고 구간을 찾는다.
  const subpaths: LatLng[][] = [];
  let run: LatLng[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (isPathBreak(pts[i - 1], pts[i])) {
      if (run.length >= 2) subpaths.push(run);
      run = [pts[i]];
    } else {
      run.push(pts[i]);
    }
  }
  if (run.length >= 2) subpaths.push(run);

  const best: Record<string, number> = {};

  for (const sub of subpaths) {
    const cumDist: number[] = [0];
    for (let i = 1; i < sub.length; i++) {
      cumDist.push(cumDist[i - 1] + haversineMeters(sub[i - 1], sub[i]));
    }
    const totalDist = cumDist[sub.length - 1];

    for (const { key, m: targetM } of PB_TARGETS) {
      if (totalDist < targetM) continue;

      let bestPaceSec = best[key] ?? Infinity;
      let j = 1;

      for (let i = 0; i < sub.length - 1; i++) {
        if (j <= i) j = i + 1;
        while (j < sub.length && cumDist[j] - cumDist[i] < targetM) j++;
        if (j >= sub.length) break;

        const segStart = cumDist[j - 1] - cumDist[i];
        const segLen = cumDist[j] - cumDist[j - 1];
        const frac = segLen > 0 ? (targetM - segStart) / segLen : 1;
        const tAtTarget = sub[j - 1].t! + frac * (sub[j].t! - sub[j - 1].t!);

        const elapsedSec = (tAtTarget - sub[i].t!) / 1000;
        if (elapsedSec > 0) {
          const paceSec = elapsedSec / (targetM / 1000);
          if (paceSec < bestPaceSec) bestPaceSec = paceSec;
        }
      }

      if (bestPaceSec !== Infinity) best[key] = bestPaceSec;
    }
  }

  const result: Record<string, number> = {};
  for (const [key, paceSec] of Object.entries(best)) result[key] = Math.round(paceSec);
  return result;
}

export function geolocationErrorCode(err: GeolocationPositionError): GeoErrorCode {
  const blocked = geolocationBlockedCode();
  if (blocked) return blocked;
  if (/secure origins/i.test(err.message || "")) return "insecure";
  if (err.code === err.PERMISSION_DENIED) return "permission";
  if (err.code === err.TIMEOUT) return "timeout";
  return "unknown";
}
