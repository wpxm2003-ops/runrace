"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  estimateCalories,
  formatDuration,
  formatPaceMinPerKm,
  pathDistanceMeters,
  shouldAppendPoint,
  type LatLng,
  geolocationBlockedReason,
  geolocationErrorMessage,
  type WorkoutFinishSnapshot,
  type WorkoutStatus,
} from "./workoutTrack";

function computeElapsedSec(
  runStarted: number,
  pausedAccum: number,
  pauseStarted: number | null,
): number {
  let pausedExtra = pausedAccum;
  if (pauseStarted != null) {
    pausedExtra += Date.now() - pauseStarted;
  }
  return Math.max(0, Math.floor((Date.now() - runStarted - pausedExtra) / 1000));
}

export function useWorkoutSession() {
  const [status, setStatus] = useState<WorkoutStatus>("idle");
  const [path, setPath] = useState<LatLng[]>([]);
  const [position, setPosition] = useState<LatLng | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [distanceM, setDistanceM] = useState(0);
  const [geoError, setGeoError] = useState<string | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const statusRef = useRef(status);
  const pathRef = useRef(path);
  const pausedAccumRef = useRef(0);
  const pauseStartedRef = useRef<number | null>(null);
  const runStartedRef = useRef<number | null>(null);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    pathRef.current = path;
  }, [path]);

  const clearWatch = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const appendPosition = useCallback((coords: GeolocationCoordinates) => {
    if (statusRef.current !== "running") return;
    const point: LatLng = { lat: coords.latitude, lng: coords.longitude };
    setPosition(point);

    setPath((prev) => {
      const last = prev[prev.length - 1] ?? null;
      if (!shouldAppendPoint(last, point)) return prev;
      const next = [...prev, point];
      setDistanceM(pathDistanceMeters(next));
      return next;
    });
  }, []);

  const startWatch = useCallback(() => {
    const blocked = geolocationBlockedReason();
    if (blocked) {
      setGeoError(blocked);
      return;
    }
    setGeoError(null);
    clearWatch();
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => appendPosition(pos.coords),
      (err) => setGeoError(geolocationErrorMessage(err)),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
    );
  }, [appendPosition, clearWatch]);

  useEffect(() => {
    if (status !== "running") return;
    const id = window.setInterval(() => {
      if (!runStartedRef.current) return;
      setElapsedSec(
        computeElapsedSec(
          runStartedRef.current,
          pausedAccumRef.current,
          pauseStartedRef.current,
        ),
      );
    }, 1000);
    return () => clearInterval(id);
  }, [status]);

  useEffect(() => () => clearWatch(), [clearWatch]);

  useEffect(() => {
    const blocked = geolocationBlockedReason();
    if (blocked) {
      setGeoError(blocked);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setGeoError(null);
      },
      (err) => setGeoError(geolocationErrorMessage(err)),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60_000 },
    );
  }, []);

  const start = useCallback(() => {
    setPath([]);
    setDistanceM(0);
    setElapsedSec(0);
    pausedAccumRef.current = 0;
    pauseStartedRef.current = null;
    runStartedRef.current = Date.now();
    setStatus("running");
    startWatch();

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPosition(p);
        setPath([p]);
      },
      (err) => setGeoError(geolocationErrorMessage(err)),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }, [startWatch]);

  const pause = useCallback(() => {
    if (statusRef.current !== "running") return;
    pauseStartedRef.current = Date.now();
    setStatus("paused");
    clearWatch();
    if (runStartedRef.current) {
      setElapsedSec(
        computeElapsedSec(
          runStartedRef.current,
          pausedAccumRef.current,
          pauseStartedRef.current,
        ),
      );
    }
  }, [clearWatch]);

  const resume = useCallback(() => {
    if (statusRef.current !== "paused") return;
    if (pauseStartedRef.current) {
      pausedAccumRef.current += Date.now() - pauseStartedRef.current;
      pauseStartedRef.current = null;
    }
    setStatus("running");
    startWatch();
  }, [startWatch]);

  const stop = useCallback((): WorkoutFinishSnapshot | null => {
    if (statusRef.current === "idle" || runStartedRef.current == null) {
      return null;
    }

    const endedAt = new Date().toISOString();
    const startedAt = new Date(runStartedRef.current).toISOString();
    const finalElapsed = computeElapsedSec(
      runStartedRef.current,
      pausedAccumRef.current,
      pauseStartedRef.current,
    );

    let finalPath = [...pathRef.current];
    if (finalPath.length === 0 && position) {
      finalPath = [position];
    }
    const finalDistance = pathDistanceMeters(finalPath);

    const snapshot: WorkoutFinishSnapshot = {
      startedAt,
      endedAt,
      durationSec: Math.max(1, finalElapsed),
      distanceM: finalDistance,
      calories: estimateCalories(finalDistance),
      avgPaceSecPerKm:
        finalDistance >= 10
          ? Math.round(finalElapsed / (finalDistance / 1000))
          : null,
      path: finalPath,
    };

    clearWatch();
    pauseStartedRef.current = null;
    pausedAccumRef.current = 0;
    runStartedRef.current = null;
    setStatus("idle");
    setPath([]);
    setDistanceM(0);
    setElapsedSec(0);

    return snapshot;
  }, [clearWatch, position]);

  return {
    status,
    path,
    position,
    elapsedSec,
    distanceM,
    geoError,
    elapsedLabel: formatDuration(elapsedSec),
    paceLabel: formatPaceMinPerKm(distanceM, elapsedSec),
    calories: estimateCalories(distanceM),
    start,
    pause,
    resume,
    stop,
  };
}
