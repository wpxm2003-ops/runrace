import { haversineMeters, type LatLng, type VehicleDetectState } from "./workoutTrack";

/** 워크아웃 훅의 상태 전이와 독립적인 시간·속도·감지기 초기값 계산. */
export function computeWorkoutElapsedSec(
  runStarted: number,
  pausedAccum: number,
  pauseStarted: number | null,
  nowMs: number = Date.now(),
): number {
  let extra = pausedAccum;
  if (pauseStarted != null) extra += nowMs - pauseStarted;
  return Math.max(0, Math.floor((nowMs - runStarted - extra) / 1000));
}

/** GPS 연속 두 점과 시간 차로 속도(m/s)를 계산한다. */
export function computeWorkoutSpeedMps(
  prev: LatLng,
  curr: LatLng,
  dtMs: number,
): number | null {
  if (dtMs <= 0) return null;
  return haversineMeters(prev, curr) / (dtMs / 1000);
}

export function initialVehicleDetectState(): VehicleDetectState {
  return {
    tier: "normal",
    suspectHighSinceMs: null,
    confirmedHighSinceMs: null,
    lowSpeedSinceMs: null,
    weakGpsSinceMs: null,
    recoveringFromWeakGps: false,
    hasHadGoodFix: false,
    accuracyRecent: [],
  };
}
