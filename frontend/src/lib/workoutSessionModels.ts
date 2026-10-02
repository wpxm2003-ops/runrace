/** 러닝 시작 후 경과 ms(t)를 포함하는 경로 좌표. */
export type LatLng = { lat: number; lng: number; t?: number; breakBefore?: boolean };
export type WorkoutStatus = "idle" | "running" | "paused";
export type WorkoutFinishSnapshot = {
  clientWorkoutId: string;
  startedAt: string;
  startedAtLocal: string;
  endedAt: string;
  durationSec: number;
  distanceM: number;
  calories: number;
  avgPaceSecPerKm: number | null;
  path: LatLng[];
};
export type WorkoutStartFix = {
  ownerUid: string;
  lat: number;
  lng: number;
  accuracyM: number | null;
  fixAtMs: number;
  receivedAtMs: number;
};

export const WORKOUT_START_FIX_MAX_AGE_MS = 5_000;
export const WORKOUT_START_FIX_MAX_ACCURACY_M = 20;

export function pickWorkoutStartSeed(
  fixes: readonly WorkoutStartFix[], ownerUid: string, startedAtMs: number,
  maxAgeMs: number = WORKOUT_START_FIX_MAX_AGE_MS,
): LatLng | null {
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(maxAgeMs) || maxAgeMs < 0) return null;
  for (let i = fixes.length - 1; i >= 0; i--) {
    const fix = fixes[i];
    const fixAgeMs = startedAtMs - fix.fixAtMs;
    const receiptAgeMs = startedAtMs - fix.receivedAtMs;
    if (fix.ownerUid !== ownerUid || !Number.isFinite(fix.lat) || fix.lat < -90 || fix.lat > 90
      || !Number.isFinite(fix.lng) || fix.lng < -180 || fix.lng > 180
      || fix.accuracyM == null || !Number.isFinite(fix.accuracyM) || fix.accuracyM < 0
      || fix.accuracyM > WORKOUT_START_FIX_MAX_ACCURACY_M || !Number.isFinite(fix.fixAtMs)
      || !Number.isFinite(fix.receivedAtMs) || fixAgeMs < 0 || receiptAgeMs < 0
      || fixAgeMs > maxAgeMs || receiptAgeMs > maxAgeMs) continue;
    return { lat: fix.lat, lng: fix.lng, t: 0 };
  }
  return null;
}
