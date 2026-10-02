import type { IdleAnchor, LatLng, VehicleDetectState, WorkoutStatus } from "./workoutTrack";
import { initialVehicleDetectState } from "./workoutSessionMath";
import type { WorkoutStartFix } from "./workoutSessionModels";

type Ref<T> = { current: T };

export function clearWorkoutWatch(refs: {
  watchSeq: Ref<number>;
  watchStartedAt: Ref<number | null>;
  stopWatch: Ref<(() => void) | null>;
}) {
  refs.watchSeq.current++;
  refs.watchStartedAt.current = null;
  refs.stopWatch.current?.();
  refs.stopWatch.current = null;
}

export type WorkoutRuntimeRefs = {
  status: Ref<WorkoutStatus>;
  path: Ref<LatLng[]>;
  sessionOwnerUid: Ref<string | null>;
  clientWorkoutId: Ref<string | null>;
  pauseStarted: Ref<number | null>;
  pausedAccum: Ref<number>;
  runStarted: Ref<number | null>;
  autoPaused: Ref<boolean>;
  idleAnchor: Ref<IdleAnchor | null>;
  warmupFixes: Ref<WorkoutStartFix[]>;
  vehicleState: Ref<VehicleDetectState>;
  distanceAccum: Ref<number>;
  lastPathPoint: Ref<LatLng | null>;
  lastAppendWallMs: Ref<number | null>;
  lastRawPos: Ref<LatLng | null>;
  lastPosTime: Ref<number | null>;
  watchStartedAt: Ref<number | null>;
  lastGpsFixAt: Ref<number | null>;
  lastWatchRestartAt: Ref<number | null>;
  reanchorNext: Ref<boolean>;
};

/** 저장소를 건드리지 않고 한 세션의 가변 런타임만 초기 상태로 되돌린다. */
export function resetWorkoutRuntimeRefs(refs: WorkoutRuntimeRefs) {
  refs.status.current = "idle";
  refs.path.current = [];
  refs.sessionOwnerUid.current = null;
  refs.clientWorkoutId.current = null;
  refs.pauseStarted.current = null;
  refs.pausedAccum.current = 0;
  refs.runStarted.current = null;
  refs.autoPaused.current = false;
  refs.idleAnchor.current = null;
  refs.warmupFixes.current = [];
  refs.vehicleState.current = initialVehicleDetectState();
  refs.distanceAccum.current = 0;
  refs.lastPathPoint.current = null;
  refs.lastAppendWallMs.current = null;
  refs.lastRawPos.current = null;
  refs.lastPosTime.current = null;
  refs.watchStartedAt.current = null;
  refs.lastGpsFixAt.current = null;
  refs.lastWatchRestartAt.current = null;
  refs.reanchorNext.current = false;
}
