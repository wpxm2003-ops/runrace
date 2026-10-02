import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { computeWorkoutElapsedSec } from "./workoutSessionMath";
import { shouldRestartGpsWatch, type WorkoutStatus } from "./workoutTrack";

const GPS_WATCHDOG_POLL_MS = 5_000;

type Cell<T> = { current: T };

type RuntimeEffectsInput = {
  status: WorkoutStatus;
  statusRef: Cell<WorkoutStatus>;
  watchStartedAtRef: Cell<number | null>;
  lastGpsFixAtRef: Cell<number | null>;
  runStartedRef: Cell<number | null>;
  pausedAccumRef: Cell<number>;
  pauseStartedRef: Cell<number | null>;
  restartWatch: (reason: "foreground" | "stale") => void;
  autoPauseIfIdle: (nowMs: number) => boolean;
  setElapsedSec: (elapsedSec: number) => void;
};

/** 네이티브 복귀, GPS 무응답 감시, 경과시간 갱신의 수명주기를 한곳에서 관리한다. */
export function useWorkoutRuntimeEffects({
  status,
  statusRef,
  watchStartedAtRef,
  lastGpsFixAtRef,
  runStartedRef,
  pausedAccumRef,
  pauseStartedRef,
  restartWatch,
  autoPauseIfIdle,
  setElapsedSec,
}: RuntimeEffectsInput) {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let cancelled = false;
    let listener: { remove: () => Promise<void> } | undefined;

    void import("@capacitor/app").then(async ({ App }) => {
      if (cancelled) return;
      listener = await App.addListener("appStateChange", ({ isActive }) => {
        if (!cancelled && isActive) restartWatch("foreground");
      });
      if (cancelled) void listener.remove();
    });

    return () => {
      cancelled = true;
      void listener?.remove();
    };
  }, [restartWatch]);

  useEffect(() => {
    if (status !== "running") return;
    const id = window.setInterval(() => {
      if (document.hidden || statusRef.current !== "running") return;
      if (shouldRestartGpsWatch(
        Date.now(),
        watchStartedAtRef.current,
        lastGpsFixAtRef.current,
      )) {
        restartWatch("stale");
      }
    }, GPS_WATCHDOG_POLL_MS);
    return () => clearInterval(id);
  }, [status, statusRef, watchStartedAtRef, lastGpsFixAtRef, restartWatch]);

  useEffect(() => {
    if (status !== "running") return;
    const id = window.setInterval(() => {
      if (!runStartedRef.current) return;
      if (autoPauseIfIdle(Date.now())) return;
      setElapsedSec(computeWorkoutElapsedSec(
        runStartedRef.current,
        pausedAccumRef.current,
        pauseStartedRef.current,
      ));
    }, 1000);
    return () => clearInterval(id);
  }, [
    status,
    runStartedRef,
    pausedAccumRef,
    pauseStartedRef,
    autoPauseIfIdle,
    setElapsedSec,
  ]);
}
