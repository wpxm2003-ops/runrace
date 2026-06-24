/** lat/lng에 러닝 시작 후 경과 ms(t)를 함께 저장한다. 구형 기록은 t가 없을 수 있다. */
export type LatLng = { lat: number; lng: number; t?: number };

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
const RECOVERY_CONFIRM_MS = 5_000;

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
  const { tier, accuracyRecent } = state;
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
  if (isGpsWeak(accuracyM, speedMps, accuracyRecent)) {
    weakGpsSinceMs = weakGpsSinceMs ?? nowMs;
    if (nowMs - weakGpsSinceMs >= WEAK_GPS_FORCE_CONFIRM_MS) {
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
    return result({
      tier: "recovering",
      blockDistance: true,
      blockPathPoints: true,
      suspectHighSinceMs: null,
      confirmedHighSinceMs: null,
      lowSpeedSinceMs:
        speedMps != null && speedMps <= recoveryMs ? nowMs : null,
    });
  }

  // ── 2) Recovering: 양호 GPS + 저속 ───────────────────────────────────────
  if (tier === "recovering") {
    const speedOk = speedMps != null && speedMps <= recoveryMs;
    const gpsOk = isGpsGood(accuracyM);
    if (speedOk && gpsOk) {
      if (lowSpeedSinceMs == null) lowSpeedSinceMs = nowMs;
      if (nowMs - lowSpeedSinceMs >= RECOVERY_CONFIRM_MS) {
        return result({
          tier: "normal",
          blockDistance: false,
          blockPathPoints: false,
          reanchorNextPoint: true,
          suspectHighSinceMs: null,
          confirmedHighSinceMs: null,
          lowSpeedSinceMs: null,
          weakGpsSinceMs: null,
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
    const seg = haversineMeters(pts[i - 1], pts[i]);
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
