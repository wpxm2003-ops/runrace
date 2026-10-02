"use client";

import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { createClientWorkoutId } from "./workoutRequestId";
import { loadWorkoutForOwner, saveWorkout } from "./workoutPersistence";
import { computeWorkoutElapsedSec } from "./workoutSessionMath";
import {
  creditedPathDistanceMeters,
  idleAutoPauseAt,
  type IdleAnchor,
  type LatLng,
  type WorkoutStatus,
} from "./workoutTrack";

type Ref<T> = MutableRefObject<T>;
type Setter<T> = Dispatch<SetStateAction<T>>;

type RestoreOptions = {
  currentUid: string | null;
  authLoading: boolean;
  statusRef: Ref<WorkoutStatus>;
  runStartedRef: Ref<number | null>;
  idleAnchorRef: Ref<IdleAnchor | null>;
  pauseStartedRef: Ref<number | null>;
  autoPausedRef: Ref<boolean>;
  clientWorkoutIdRef: Ref<string | null>;
  pathRef: Ref<LatLng[]>;
  distanceAccumRef: Ref<number>;
  pausedAccumRef: Ref<number>;
  sessionOwnerUidRef: Ref<string | null>;
  restoreAttemptedUidRef: Ref<string | null>;
  lastPathPointRef: Ref<LatLng | null>;
  reanchorNextRef: Ref<boolean>;
  lastAppendWallMsRef: Ref<number | null>;
  clampIdlePauseAt: (timeMs: number) => number;
  clearWatch: () => void;
  resetRuntime: () => void;
  startWatch: () => void;
  setPath: Setter<LatLng[]>;
  setPosition: Setter<LatLng | null>;
  setDistanceM: Setter<number>;
  setAutoPaused: Setter<boolean>;
  setElapsedSec: Setter<number>;
  setStatus: Setter<WorkoutStatus>;
};

/** Keeps persisted workout ownership aligned with Firebase authentication changes. */
export function useWorkoutSessionRestore(options: RestoreOptions) {
  const {
    currentUid, authLoading, statusRef, runStartedRef, idleAnchorRef,
    pauseStartedRef, autoPausedRef, clientWorkoutIdRef, pathRef,
    distanceAccumRef, pausedAccumRef, sessionOwnerUidRef, restoreAttemptedUidRef,
    lastPathPointRef, reanchorNextRef, lastAppendWallMsRef, clampIdlePauseAt,
    clearWatch, resetRuntime, startWatch, setPath, setPosition, setDistanceM,
    setAutoPaused, setElapsedSec, setStatus,
  } = options;

  const suspendForAuthChange = useCallback((ownerUid: string) => {
    if (statusRef.current !== "idle" && runStartedRef.current != null) {
      const now = Date.now();
      if (statusRef.current === "running") {
        const inferred = idleAnchorRef.current != null
          ? idleAutoPauseAt(idleAnchorRef.current, now)
          : null;
        pauseStartedRef.current = inferred != null ? clampIdlePauseAt(inferred) : now;
        autoPausedRef.current = inferred != null;
        statusRef.current = "paused";
      }
      saveWorkout({
        ownerUid,
        clientWorkoutId: clientWorkoutIdRef.current ?? undefined,
        status: "paused",
        path: pathRef.current,
        distanceM: distanceAccumRef.current,
        runStartedAt: runStartedRef.current,
        pausedAccumMs: pausedAccumRef.current,
        pauseStartedAt: pauseStartedRef.current,
        idleAnchor: idleAnchorRef.current ?? undefined,
        autoPaused: autoPausedRef.current,
      });
    }
    clearWatch();
    restoreAttemptedUidRef.current = null;
    resetRuntime();
  }, [
    autoPausedRef, clampIdlePauseAt, clearWatch, clientWorkoutIdRef,
    distanceAccumRef, idleAnchorRef, pathRef, pauseStartedRef, pausedAccumRef,
    resetRuntime, restoreAttemptedUidRef, runStartedRef, statusRef,
  ]);

  useEffect(() => {
    if (authLoading) return;
    const ownerUid = sessionOwnerUidRef.current;
    if (ownerUid != null && ownerUid !== currentUid) {
      suspendForAuthChange(ownerUid);
    } else if (currentUid == null) {
      restoreAttemptedUidRef.current = null;
    }
  }, [
    authLoading, currentUid, restoreAttemptedUidRef, sessionOwnerUidRef,
    suspendForAuthChange,
  ]);

  useEffect(() => {
    if (authLoading || currentUid == null) return;
    const ownerUid = currentUid;
    if (statusRef.current !== "idle" || restoreAttemptedUidRef.current === ownerUid) return;
    restoreAttemptedUidRef.current = ownerUid;

    const saved = loadWorkoutForOwner(ownerUid);
    if (!saved) return;
    sessionOwnerUidRef.current = ownerUid;
    clientWorkoutIdRef.current = saved.clientWorkoutId ?? createClientWorkoutId();
    runStartedRef.current = saved.runStartedAt;
    pausedAccumRef.current = saved.pausedAccumMs;
    pathRef.current = saved.path;
    setPath(saved.path);
    lastPathPointRef.current = saved.path[saved.path.length - 1] ?? null;
    setPosition(lastPathPointRef.current);
    reanchorNextRef.current = true;
    const restoredDistance = saved.distanceM ?? creditedPathDistanceMeters(saved.path);
    distanceAccumRef.current = restoredDistance;
    setDistanceM(restoredDistance);

    const restoredAnchor = saved.idleAnchor ?? {
      timeMs: saved.lastMovementAt ?? saved.savedAt,
      distanceM: restoredDistance,
    };
    idleAnchorRef.current = restoredAnchor.position || !lastPathPointRef.current
      ? restoredAnchor
      : {
          ...restoredAnchor,
          position: {
            lat: lastPathPointRef.current.lat,
            lng: lastPathPointRef.current.lng,
          },
        };
    const lastT = lastPathPointRef.current?.t;
    lastAppendWallMsRef.current = lastT != null
      ? saved.runStartedAt + saved.pausedAccumMs + lastT
      : null;

    if (saved.status === "running") {
      const rawIdlePausedAt = idleAutoPauseAt(idleAnchorRef.current, Date.now());
      const idlePausedAt = rawIdlePausedAt != null ? clampIdlePauseAt(rawIdlePausedAt) : null;
      if (idlePausedAt != null) {
        pauseStartedRef.current = idlePausedAt;
        autoPausedRef.current = true;
        setAutoPaused(true);
        setElapsedSec(computeWorkoutElapsedSec(
          saved.runStartedAt, saved.pausedAccumMs, idlePausedAt,
        ));
        setStatus("paused");
        statusRef.current = "paused";
      } else {
        pauseStartedRef.current = null;
        autoPausedRef.current = false;
        setAutoPaused(false);
        setElapsedSec(computeWorkoutElapsedSec(saved.runStartedAt, saved.pausedAccumMs, null));
        setStatus("running");
        statusRef.current = "running";
        startWatch();
      }
    } else {
      autoPausedRef.current = saved.autoPaused === true;
      setAutoPaused(saved.autoPaused === true);
      pauseStartedRef.current = saved.pauseStartedAt;
      setElapsedSec(computeWorkoutElapsedSec(
        saved.runStartedAt, saved.pausedAccumMs, saved.pauseStartedAt,
      ));
      setStatus("paused");
      statusRef.current = "paused";
    }
  }, [
    authLoading, autoPausedRef, clampIdlePauseAt, clientWorkoutIdRef, currentUid,
    distanceAccumRef, idleAnchorRef, lastAppendWallMsRef, lastPathPointRef,
    pathRef, pauseStartedRef, pausedAccumRef, reanchorNextRef,
    restoreAttemptedUidRef, runStartedRef, sessionOwnerUidRef, setAutoPaused,
    setDistanceM, setElapsedSec, setPath, setPosition, setStatus, startWatch,
    statusRef,
  ]);
}
