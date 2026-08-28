import {
  haversineMeters,
  type LatLng,
} from "./workoutTrack";
import { IDLE_AUTO_PAUSE_MIN_SPAN_M } from "./workoutThresholds";

export type GeoErrorCode = "unavailable" | "insecure" | "permission" | "timeout" | "unknown";

export function geolocationBlockedCode(): GeoErrorCode | null {
  if (typeof window === "undefined") return null;
  if (!navigator.geolocation) return "unavailable";
  if (!window.isSecureContext) return "insecure";
  return null;
}

export const GPS_WATCHDOG_TIMEOUT_MS = 15_000;
export const GPS_FOREGROUND_RECOVERY_GAP_MS = 30_000;

/** A running foreground watch is stale when neither startup nor the last fix is recent. */
export function shouldRestartGpsWatch(
  nowMs: number,
  watchStartedAtMs: number | null,
  lastFixAtMs: number | null,
  timeoutMs: number = GPS_WATCHDOG_TIMEOUT_MS,
): boolean {
  if (watchStartedAtMs == null) return true;
  return nowMs - Math.max(watchStartedAtMs, lastFixAtMs ?? 0) >= timeoutMs;
}

/** Uses the same spatial threshold as idle detection so foreground recovery stays consistent. */
export const IDLE_GAP_MOVEMENT_THRESHOLD_M = IDLE_AUTO_PAUSE_MIN_SPAN_M;

export function foregroundGapLooksLikeMovement(
  reference: LatLng | null | undefined,
  recovered: LatLng | null | undefined,
  thresholdM: number = IDLE_GAP_MOVEMENT_THRESHOLD_M,
): boolean {
  if (!reference || !recovered) return true;
  return haversineMeters(reference, recovered) >= thresholdM;
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

export function geolocationErrorCode(err: GeolocationPositionError): GeoErrorCode {
  const blocked = geolocationBlockedCode();
  if (blocked) return blocked;
  if (/secure origins/i.test(err.message || "")) return "insecure";
  if (err.code === err.PERMISSION_DENIED) return "permission";
  if (err.code === err.TIMEOUT) return "timeout";
  return "unknown";
}
