import { WORKOUT_START_FIX_MAX_ACCURACY_M } from "./workoutSessionModels";
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

