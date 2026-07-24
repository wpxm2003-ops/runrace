/** lat/lng에 러닝 시작 후 경과 ms(t)를 함께 저장한다. 구형 기록은 t가 없을 수 있다. */
export type LatLng = { lat: number; lng: number; t?: number; ele?: number };

export type WorkoutStatus = "idle" | "running" | "paused";

export type WorkoutFinishSnapshot = {
  startedAt: string;
  endedAt: string;
  durationSec: number;
  distanceM: number;
  calories: number;
  avgPaceSecPerKm: number | null;
  path: LatLng[];
};

const MIN_MOVE_METERS = 4;
const EARTH_RADIUS_M = 6_371_000;

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
    const seg = haversineMeters(points[i - 1], points[i]);
    if (seg <= gapThresholdM) sum += seg;
  }
  return sum;
}

/** 연속 두 점 사이가 이 거리(m)를 넘으면 지도에서 추적 끊김(점선)으로 본다. */
export const MAP_GAP_THRESHOLD_M = 120;

export type PathSegments = { solidLines: LatLng[][]; gapLines: LatLng[][] };

/**
 * GPS 경로를 지도 렌더링용 실선(연속 구간)·점선(끊긴 구간)으로 분리한다.
 * 경로 포인트엔 시각이 없어 거리 점프 휴리스틱을 쓴다(백그라운드 추적 끊김 대응).
 * Kakao/Leaflet 지도 컴포넌트가 공용으로 사용한다.
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
    if (haversineMeters(path[i - 1], path[i]) > gapThresholdM) {
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
const GPS_ACCURACY_GOOD_M = 20;
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

export function formatDuration(totalSeconds: number): string {
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

/** http://IP 등 비보안 페이지에서는 Geolocation API 사용 불가 */
export function geolocationBlockedReason(): string | null {
  if (typeof window === "undefined") return null;
  if (!navigator.geolocation) {
    return "이 기기에서는 위치(GPS) 기능을 사용할 수 없습니다.";
  }
  if (!window.isSecureContext) {
    return "GPS는 HTTPS(보안 접속)에서만 사용할 수 있습니다. http://IP 주소로는 브라우저가 위치를 막습니다. 도메인에 SSL을 붙이거나 localhost에서 테스트해 주세요.";
  }
  return null;
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
    const rawSeg = haversineMeters(pts[i - 1], pts[i]);
    // 추적 끊김(>120m) 구간은 거리 0으로 취급 — 라이브 거리 집계(재정박)와 일치시키고,
    // 끊김을 직선으로 이어 구간 페이스가 실제보다 빨라지는 것을 막는다(시간은 흐른 대로 반영).
    const seg = rawSeg > MAP_GAP_THRESHOLD_M ? 0 : rawSeg;
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

  // 추적 끊김(>120m)을 가로지르는 윈도우 금지 — 지하철·일시정지 중 이동을 직선으로 이으면
  // 비현실적으로 빠른 구간이 만들어져 가짜 PB가 서버에 등록된다(PB→NSM·유령까지 오염).
  // 끊김 없는 연속 구간별로만 최고 구간을 찾는다.
  const subpaths: LatLng[][] = [];
  let run: LatLng[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (haversineMeters(pts[i - 1], pts[i]) > MAP_GAP_THRESHOLD_M) {
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

export function geolocationErrorMessage(err: GeolocationPositionError): string {
  const blocked = geolocationBlockedReason();
  if (blocked) return blocked;
  const msg = err.message || "";
  if (/secure origins/i.test(msg)) {
    return "GPS는 HTTPS(보안 접속)에서만 사용할 수 있습니다. 서버에 SSL(HTTPS)을 설정해 주세요.";
  }
  if (err.code === err.PERMISSION_DENIED) {
    return "위치 권한이 거부되었습니다. 브라우저 설정에서 이 사이트의 위치를 허용해 주세요.";
  }
  if (err.code === err.TIMEOUT) {
    return "위치 확인 시간이 초과되었습니다. GPS를 켠 뒤 다시 시도해 주세요.";
  }
  return msg || "위치를 가져올 수 없습니다.";
}
