import type { LatLng, VehicleDetectState, WorkoutStatus } from "./workoutTrack";
import { initialVehicleDetectState } from "./workoutSessionMath";

type Ref<T> = { current: T };

export type PauseTransitionRefs = {
  pauseStarted: Ref<number | null>;
  pausedAccum: Ref<number>;
  autoPaused: Ref<boolean>;
  status: Ref<WorkoutStatus>;
};

export function pauseWorkoutRuntime(refs: PauseTransitionRefs, nowMs: number) {
  refs.pauseStarted.current = nowMs;
  refs.autoPaused.current = false;
  refs.status.current = "paused";
}

export function resumeWorkoutRuntime(refs: PauseTransitionRefs & {
  idleAnchor: Ref<{ timeMs: number; distanceM: number } | null>;
  distanceAccum: Ref<number>;
  vehicleState: Ref<VehicleDetectState>;
  reanchorNext: Ref<boolean>;
  lastRawPos: Ref<LatLng | null>;
  lastPosTime: Ref<number | null>;
}, nowMs: number) {
  if (refs.pauseStarted.current != null) {
    refs.pausedAccum.current += nowMs - refs.pauseStarted.current;
    refs.pauseStarted.current = null;
  }
  refs.autoPaused.current = false;
  refs.idleAnchor.current = { timeMs: nowMs, distanceM: refs.distanceAccum.current };
  refs.vehicleState.current = initialVehicleDetectState();
  refs.reanchorNext.current = true;
  refs.lastRawPos.current = null;
  refs.lastPosTime.current = null;
  refs.status.current = "running";
}
