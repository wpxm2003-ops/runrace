import { avgPaceSecPerKm } from "./paceMath";
import { toWallClockIso } from "./format";
import { computeWorkoutElapsedSec } from "./workoutSessionMath";
import {
  estimateCalories,
  type GeoErrorCode,
  type LatLng,
  type WorkoutFinishSnapshot,
  type WorkoutStatus,
} from "./workoutTrack";
import type { GeoErrorState } from "./useWorkoutGpsWarmup";

const FALLBACK_GEO_MESSAGES: Record<GeoErrorCode, string> = {
  unavailable: "Location (GPS) is not available on this device.",
  insecure: "GPS only works over a secure (HTTPS) connection.",
  permission: "Location permission was denied.",
  timeout: "Timed out getting your location.",
  unknown: "Couldn't get your location.",
};

export function resolveWorkoutGeoError(
  error: GeoErrorState | null,
  messages?: Record<GeoErrorCode, string>,
): string | null {
  if (error == null) return null;
  return "code" in error
    ? (messages?.[error.code] ?? FALLBACK_GEO_MESSAGES[error.code])
    : error.text;
}

export function isWorkoutSessionVisible(
  authLoading: boolean,
  currentUid: string | null,
  status: WorkoutStatus,
  ownerUid: string | null,
): boolean {
  return !authLoading
    && currentUid != null
    && (status === "idle" || ownerUid === currentUid);
}

type FinishSnapshotInput = {
  clientWorkoutId: string;
  runStartedAt: number;
  pausedAccumMs: number;
  pauseStartedAt: number | null;
  endedAtMs: number;
  distanceM: number;
  path: LatLng[];
  position: LatLng | null;
};

export function buildWorkoutFinishSnapshot({
  clientWorkoutId,
  runStartedAt,
  pausedAccumMs,
  pauseStartedAt,
  endedAtMs,
  distanceM,
  path,
  position,
}: FinishSnapshotInput): WorkoutFinishSnapshot {
  const finalElapsed = computeWorkoutElapsedSec(
    runStartedAt,
    pausedAccumMs,
    pauseStartedAt,
    endedAtMs,
  );
  const finalDistance = Math.round(distanceM);
  const finalPath = path.length === 0 && position ? [position] : [...path];

  return {
    clientWorkoutId,
    startedAt: new Date(runStartedAt).toISOString(),
    startedAtLocal: toWallClockIso(runStartedAt),
    endedAt: new Date(endedAtMs).toISOString(),
    durationSec: Math.max(1, finalElapsed),
    distanceM: finalDistance,
    calories: estimateCalories(finalDistance),
    avgPaceSecPerKm: avgPaceSecPerKm(finalDistance, finalElapsed),
    path: finalPath,
  };
}
