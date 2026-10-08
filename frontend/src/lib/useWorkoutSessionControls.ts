"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { track } from "./analytics";
import { clearWorkout } from "./workoutPersistence";
import { createClientWorkoutId } from "./workoutRequestId";
import { computeWorkoutElapsedSec, initialVehicleDetectState } from "./workoutSessionMath";
import { buildWorkoutFinishSnapshot } from "./workoutSessionPresentation";
import { pauseWorkoutRuntime, resumeWorkoutRuntime } from "./workoutSessionTransitions";
import {
  geolocationBlockedCode,
  geolocationErrorCode,
  idleAutoPauseAt,
  normalizeGpsAccuracyM,
  pickWorkoutStartSeed,
  slideIdleAnchor,
  WORKOUT_START_FIX_MAX_AGE_MS,
  type IdleAnchor,
  type LatLng,
  type VehicleDetectState,
  type VehicleTier,
  type WorkoutFinishSnapshot,
  type WorkoutStartFix,
  type WorkoutStatus,
} from "./workoutTrack";
import type { GeoErrorState } from "./useWorkoutGpsWarmup";

type Ref<T> = MutableRefObject<T>;
type Setter<T> = Dispatch<SetStateAction<T>>;

type Options = {
  authLoadingRef: Ref<boolean>;
  currentUidRef: Ref<string | null>;
  statusRef: Ref<WorkoutStatus>;
  sessionOwnerUidRef: Ref<string | null>;
  clientWorkoutIdRef: Ref<string | null>;
  restoreAttemptedUidRef: Ref<string | null>;
  warmupFixesRef: Ref<WorkoutStartFix[]>;
  pathRef: Ref<LatLng[]>;
  distanceAccumRef: Ref<number>;
  lastPathPointRef: Ref<LatLng | null>;
  lastAppendWallMsRef: Ref<number | null>;
  reanchorNextRef: Ref<boolean>;
  vehicleStateRef: Ref<VehicleDetectState>;
  pausedAccumRef: Ref<number>;
  pauseStartedRef: Ref<number | null>;
  runStartedRef: Ref<number | null>;
  autoPausedRef: Ref<boolean>;
  idleAnchorRef: Ref<IdleAnchor | null>;
  lastRawPosRef: Ref<LatLng | null>;
  lastPosTimeRef: Ref<number | null>;
  watchSeqRef: Ref<number>;
  currentPosition: LatLng | null;
  isCurrentSessionOwner: (expectedUid?: string) => boolean;
  autoPauseIfIdle: (nowMs: number) => boolean;
  clampIdlePauseAt: (pausedAt: number) => number;
  startWatch: () => void;
  clearWatch: () => void;
  sendLivePing: (options?: { force?: boolean }) => void;
  pauseLiveRun: (expectedUid: string) => void;
  clearLiveRivalGaps: () => void;
  resetRuntime: () => void;
  setPath: Setter<LatLng[]>;
  setPosition: Setter<LatLng | null>;
  setDistanceM: Setter<number>;
  setElapsedSec: Setter<number>;
  setVehicleTier: Setter<VehicleTier>;
  setAutoPaused: Setter<boolean>;
  setStatus: Setter<WorkoutStatus>;
  setGeoErrorState: Setter<GeoErrorState | null>;
};

/** 사용자가 호출하는 시작·일시정지·재개·종료 전이를 한곳에서 관리한다. */
export function useWorkoutSessionControls(options: Options) {
  const {
    authLoadingRef, currentUidRef, statusRef, sessionOwnerUidRef, clientWorkoutIdRef,
    restoreAttemptedUidRef, warmupFixesRef, pathRef, distanceAccumRef,
    lastPathPointRef, lastAppendWallMsRef, reanchorNextRef, vehicleStateRef,
    pausedAccumRef, pauseStartedRef, runStartedRef, autoPausedRef, idleAnchorRef,
    lastRawPosRef, lastPosTimeRef, watchSeqRef, currentPosition,
    isCurrentSessionOwner, autoPauseIfIdle, clampIdlePauseAt, startWatch, clearWatch,
    sendLivePing, pauseLiveRun, clearLiveRivalGaps, resetRuntime, setPath, setPosition,
    setDistanceM, setElapsedSec, setVehicleTier, setAutoPaused, setStatus,
    setGeoErrorState,
  } = options;

  const start = useCallback((expectedUid: string): boolean => {
    if (
      authLoadingRef.current
      || expectedUid !== currentUidRef.current
      || currentUidRef.current == null
      || statusRef.current !== "idle"
    ) return false;

    const blocked = geolocationBlockedCode();
    if (blocked) {
      setGeoErrorState({ code: blocked });
      return false;
    }
    const now = Date.now();
    const startSeed = pickWorkoutStartSeed(warmupFixesRef.current, expectedUid, now);
    warmupFixesRef.current = [];
    const initialPath = startSeed ? [startSeed] : [];
    sessionOwnerUidRef.current = expectedUid;
    clientWorkoutIdRef.current = createClientWorkoutId();
    restoreAttemptedUidRef.current = expectedUid;
    setPath(initialPath);
    pathRef.current = initialPath;
    distanceAccumRef.current = 0;
    lastPathPointRef.current = startSeed;
    lastAppendWallMsRef.current = startSeed ? now : null;
    reanchorNextRef.current = false;
    setDistanceM(0);
    setElapsedSec(0);
    vehicleStateRef.current = initialVehicleDetectState();
    setVehicleTier("normal");
    pausedAccumRef.current = 0;
    pauseStartedRef.current = null;
    runStartedRef.current = now;
    autoPausedRef.current = false;
    idleAnchorRef.current = startSeed
      ? slideIdleAnchor({ timeMs: now, distanceM: 0 }, now, 0, startSeed)
      : { timeMs: now, distanceM: 0 };
    setAutoPaused(false);
    lastRawPosRef.current = startSeed;
    lastPosTimeRef.current = startSeed ? now : null;
    setStatus("running");
    statusRef.current = "running";
    if (startSeed) setPosition(startSeed);
    startWatch();
    sendLivePing({ force: true });
    const seedWatchSequence = watchSeqRef.current;
    void track("running_start");

    if (startSeed) return true;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (
          watchSeqRef.current !== seedWatchSequence
          || !isCurrentSessionOwner(expectedUid)
          || statusRef.current !== "running"
          || lastPathPointRef.current != null
        ) return;

        const receivedAtMs = Date.now();
        const selected = pickWorkoutStartSeed([{
          ownerUid: expectedUid,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyM: normalizeGpsAccuracyM(position.coords.accuracy),
          fixAtMs: position.timestamp,
          receivedAtMs,
        }], expectedUid, receivedAtMs);
        if (!selected) return;
        const point: LatLng = {
          ...selected,
          t: runStartedRef.current != null ? receivedAtMs - runStartedRef.current : 0,
        };
        setPosition(point);
        lastPathPointRef.current = point;
        lastAppendWallMsRef.current = receivedAtMs;
        lastRawPosRef.current = point;
        lastPosTimeRef.current = receivedAtMs;
        idleAnchorRef.current = slideIdleAnchor(
          { timeMs: runStartedRef.current ?? receivedAtMs, distanceM: 0 },
          receivedAtMs,
          0,
          point,
        );
        pathRef.current = [point];
        setPath([point]);
      },
      (error) => {
        if (
          watchSeqRef.current === seedWatchSequence
          && isCurrentSessionOwner(expectedUid)
          && statusRef.current === "running"
        ) setGeoErrorState({ code: geolocationErrorCode(error) });
      },
      { enableHighAccuracy: true, maximumAge: WORKOUT_START_FIX_MAX_AGE_MS, timeout: 15_000 },
    );
    return true;
  }, [
    authLoadingRef, autoPausedRef, clientWorkoutIdRef, currentUidRef,
    distanceAccumRef, idleAnchorRef, isCurrentSessionOwner, lastAppendWallMsRef,
    lastPathPointRef, lastPosTimeRef, lastRawPosRef, pathRef, pausedAccumRef,
    pauseStartedRef, reanchorNextRef, restoreAttemptedUidRef, runStartedRef,
    sendLivePing, sessionOwnerUidRef, setAutoPaused, setDistanceM, setElapsedSec,
    setGeoErrorState, setPath, setPosition, setStatus, setVehicleTier, startWatch,
    statusRef, vehicleStateRef, warmupFixesRef, watchSeqRef,
  ]);

  const pause = useCallback((expectedUid: string) => {
    if (!isCurrentSessionOwner(expectedUid) || statusRef.current !== "running") return;
    const now = Date.now();
    if (autoPauseIfIdle(now)) return;
    pauseWorkoutRuntime({
      pauseStarted: pauseStartedRef,
      pausedAccum: pausedAccumRef,
      autoPaused: autoPausedRef,
      status: statusRef,
    }, now);
    setAutoPaused(false);
    setStatus("paused");
    clearWatch();
    pauseLiveRun(expectedUid);
    void track("running_pause");
    if (runStartedRef.current) {
      setElapsedSec(computeWorkoutElapsedSec(
        runStartedRef.current,
        pausedAccumRef.current,
        pauseStartedRef.current,
      ));
    }
  }, [
    autoPauseIfIdle, autoPausedRef, clearWatch, isCurrentSessionOwner,
    pauseLiveRun, pausedAccumRef, pauseStartedRef, runStartedRef, setAutoPaused,
    setElapsedSec, setStatus, statusRef,
  ]);

  const resume = useCallback((expectedUid: string) => {
    if (!isCurrentSessionOwner(expectedUid) || statusRef.current !== "paused") return;
    resumeWorkoutRuntime({
      pauseStarted: pauseStartedRef,
      pausedAccum: pausedAccumRef,
      autoPaused: autoPausedRef,
      status: statusRef,
      idleAnchor: idleAnchorRef,
      distanceAccum: distanceAccumRef,
      vehicleState: vehicleStateRef,
      reanchorNext: reanchorNextRef,
      lastRawPos: lastRawPosRef,
      lastPosTime: lastPosTimeRef,
    }, Date.now());
    setAutoPaused(false);
    setVehicleTier("normal");
    setStatus("running");
    startWatch();
    sendLivePing({ force: true });
  }, [
    autoPausedRef, distanceAccumRef, idleAnchorRef, isCurrentSessionOwner,
    lastPosTimeRef, lastRawPosRef, pausedAccumRef, pauseStartedRef,
    reanchorNextRef, sendLivePing, setAutoPaused, setStatus, setVehicleTier,
    startWatch, statusRef, vehicleStateRef,
  ]);

  const stop = useCallback((expectedUid: string): WorkoutFinishSnapshot | null => {
    if (
      !isCurrentSessionOwner(expectedUid)
      || statusRef.current === "idle"
      || runStartedRef.current == null
    ) return null;

    const now = Date.now();
    if (statusRef.current === "running" && idleAnchorRef.current != null) {
      const inferred = idleAutoPauseAt(idleAnchorRef.current, now);
      if (inferred != null) {
        pauseStartedRef.current = clampIdlePauseAt(inferred);
        autoPausedRef.current = true;
      }
    }
    const endedAt = autoPausedRef.current && pauseStartedRef.current != null
      ? pauseStartedRef.current
      : now;
    const snapshot = buildWorkoutFinishSnapshot({
      clientWorkoutId: clientWorkoutIdRef.current ?? createClientWorkoutId(),
      runStartedAt: runStartedRef.current,
      pausedAccumMs: pausedAccumRef.current,
      pauseStartedAt: pauseStartedRef.current,
      endedAtMs: endedAt,
      distanceM: distanceAccumRef.current,
      path: pathRef.current,
      position: currentPosition,
    });

    clearWatch();
    clearLiveRivalGaps();
    pauseLiveRun(expectedUid);
    clearWorkout(runStartedRef.current ?? undefined);
    restoreAttemptedUidRef.current = expectedUid;
    resetRuntime();
    return snapshot;
  }, [
    autoPausedRef, clampIdlePauseAt, clearLiveRivalGaps, clearWatch,
    clientWorkoutIdRef, currentPosition, distanceAccumRef, idleAnchorRef,
    isCurrentSessionOwner, pathRef, pauseLiveRun, pausedAccumRef,
    pauseStartedRef, resetRuntime, restoreAttemptedUidRef, runStartedRef,
    statusRef,
  ]);

  return { start, pause, resume, stop };
}
