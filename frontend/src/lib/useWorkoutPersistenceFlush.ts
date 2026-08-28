"use client";

import { useEffect, type RefObject } from "react";
import { saveWorkout } from "./workoutPersistence";
import type { IdleAnchor, LatLng, WorkoutStatus } from "./workoutTrack";

const SAVE_INTERVAL_MS = 10_000;

type WorkoutPersistenceRefs = {
  sessionOwnerUidRef: RefObject<string | null>;
  clientWorkoutIdRef: RefObject<string | null>;
  statusRef: RefObject<WorkoutStatus>;
  pathRef: RefObject<LatLng[]>;
  distanceAccumRef: RefObject<number>;
  runStartedRef: RefObject<number | null>;
  pausedAccumRef: RefObject<number>;
  pauseStartedRef: RefObject<number | null>;
  idleAnchorRef: RefObject<IdleAnchor | null>;
  autoPausedRef: RefObject<boolean>;
};

function saveSnapshot(status: WorkoutStatus, refs: WorkoutPersistenceRefs) {
  const ownerUid = refs.sessionOwnerUidRef.current;
  if (status === "idle" || refs.runStartedRef.current == null || ownerUid == null) return;

  saveWorkout({
    ownerUid,
    clientWorkoutId: refs.clientWorkoutIdRef.current ?? undefined,
    status,
    path: refs.pathRef.current,
    distanceM: refs.distanceAccumRef.current,
    runStartedAt: refs.runStartedRef.current,
    pausedAccumMs: refs.pausedAccumRef.current,
    pauseStartedAt: refs.pauseStartedRef.current,
    idleAnchor: refs.idleAnchorRef.current ?? undefined,
    autoPaused: refs.autoPausedRef.current,
  });
}

/** Persists lifecycle changes immediately and path snapshots at safe browser boundaries. */
export function useWorkoutPersistenceFlush(
  status: WorkoutStatus,
  autoPaused: boolean,
  refs: WorkoutPersistenceRefs,
) {
  // Path changes intentionally do not trigger an immediate write: serializing the full path for
  // every GPS point grows quadratically. The interval and browser-boundary flushes cover it.
  useEffect(() => {
    saveSnapshot(status, refs);
    // The refs are stable useRef objects owned by useWorkoutSession. Deliberately do not include
    // `refs`: callers construct the grouping object during render, while only lifecycle changes
    // should force an immediate write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, autoPaused]);

  useEffect(() => {
    const flush = () => saveSnapshot(refs.statusRef.current, refs);
    const onVisibility = () => { if (document.hidden) flush(); };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    const timer = setInterval(() => {
      if (refs.statusRef.current === "running") flush();
    }, SAVE_INTERVAL_MS);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      clearInterval(timer);
    };
    // The refs are stable for the component lifetime; listeners must only register once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
