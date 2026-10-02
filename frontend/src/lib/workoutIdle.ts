import { haversineMeters } from "./workoutPath";
import { IDLE_AUTO_PAUSE_MIN_SPAN_M } from "./workoutThresholds";

export const IDLE_AUTO_PAUSE_WINDOW_MS = 30 * 60_000;
export const IDLE_AUTO_PAUSE_MIN_PROGRESS_M = 100;
export { IDLE_AUTO_PAUSE_MIN_SPAN_M } from "./workoutThresholds";

type GeoPoint = { lat: number; lng: number };
export type IdleAnchor = {
  timeMs: number;
  distanceM: number;
  position?: GeoPoint;
  maxDisplacementM?: number;
};

export function slideIdleAnchor(
  anchor: IdleAnchor, nowMs: number, distanceM: number, position: GeoPoint,
): IdleAnchor {
  if (!anchor.position) {
    return { ...anchor, position: { ...position }, maxDisplacementM: 0 };
  }
  const maxDisplacementM = Math.max(
    anchor.maxDisplacementM ?? 0,
    haversineMeters(anchor.position, position),
  );
  if (distanceM - anchor.distanceM >= IDLE_AUTO_PAUSE_MIN_PROGRESS_M
      && maxDisplacementM >= IDLE_AUTO_PAUSE_MIN_SPAN_M) {
    return { timeMs: nowMs, distanceM, position: { ...position }, maxDisplacementM: 0 };
  }
  return maxDisplacementM === anchor.maxDisplacementM
    ? anchor
    : { ...anchor, maxDisplacementM };
}

export function idleAutoPauseAt(anchor: IdleAnchor, nowMs: number): number | null {
  return nowMs - anchor.timeMs >= IDLE_AUTO_PAUSE_WINDOW_MS ? anchor.timeMs : null;
}
