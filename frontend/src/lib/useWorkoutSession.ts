"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  estimateCalories,
  evaluateVehicleTier,
  formatDuration,
  formatPaceMinPerKm,
  haversineMeters,
  normalizeGpsAccuracyM,
  pathDistanceMeters,
  pushAccuracySample,
  shouldAppendPoint,
  type LatLng,
  type VehicleDetectState,
  type VehicleTier,
  geolocationBlockedReason,
  geolocationErrorMessage,
  type WorkoutFinishSnapshot,
  type WorkoutStatus,
} from "./workoutTrack";
import { saveWorkout, loadWorkout, clearWorkout } from "./workoutPersistence";
import { startBackgroundWatch, type GeoCoords } from "./backgroundGeo";

// ── 퍼시스턴스 ────────────────────────────────────────────────────────────────
const SAVE_INTERVAL_MS = 10_000;

// ── 헬퍼 ──────────────────────────────────────────────────────────────────────
function computeElapsedSec(
  runStarted: number,
  pausedAccum: number,
  pauseStarted: number | null,
): number {
  let extra = pausedAccum;
  if (pauseStarted != null) extra += Date.now() - pauseStarted;
  return Math.max(0, Math.floor((Date.now() - runStarted - extra) / 1000));
}

/** GPS 연속 두 점과 시간 차로 속도(m/s)를 계산한다. */
function computeSpeedMps(
  prev: LatLng,
  curr: LatLng,
  dtMs: number,
): number | null {
  if (dtMs <= 0) return null;
  return haversineMeters(prev, curr) / (dtMs / 1000);
}

function resetVehicleState(): VehicleDetectState {
  return {
    tier: "normal",
    suspectHighSinceMs: null,
    confirmedHighSinceMs: null,
    lowSpeedSinceMs: null,
    weakGpsSinceMs: null,
    accuracyRecent: [],
  };
}

// ── 메인 훅 ───────────────────────────────────────────────────────────────────
export function useWorkoutSession(bgNotification?: { title: string; message: string }) {
  // ── 기본 상태 ─────────────────────────────────────────────────────────────
  const [status, setStatus] = useState<WorkoutStatus>("idle");
  const [path, setPath] = useState<LatLng[]>([]);
  const [position, setPosition] = useState<LatLng | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [distanceM, setDistanceM] = useState(0);
  const [geoError, setGeoError] = useState<string | null>(null);
  // ── 치팅/복원 상태 ────────────────────────────────────────────────────────
  const [vehicleTier, setVehicleTier] = useState<VehicleTier>("normal");
  const [isRestored, setIsRestored] = useState(false);

  // ── 타이밍 레프 ───────────────────────────────────────────────────────────
  const stopWatchRef = useRef<(() => void) | null>(null);
  const statusRef = useRef(status);
  const pathRef = useRef(path);
  const pausedAccumRef = useRef(0);
  const pauseStartedRef = useRef<number | null>(null);
  const runStartedRef = useRef<number | null>(null);

  // ── 탈것 Tiered 감지 레프 ─────────────────────────────────────────────────
  const vehicleStateRef = useRef<VehicleDetectState>(resetVehicleState());
  const lastPosTimeRef = useRef<number | null>(null);
  const lastRawPosRef = useRef<LatLng | null>(null);
  const distanceAccumRef = useRef(0);

  // ── ref 동기화 ────────────────────────────────────────────────────────────
  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { pathRef.current = path; }, [path]);

  const pendingResumeWatchRef = useRef(false);

  // ── 퍼시스턴스: 상태 변경마다 저장 ──────────────────────────────────────
  useEffect(() => {
    if (status === "idle" || runStartedRef.current == null) return;
    saveWorkout({
      status: status as "running" | "paused",
      path: pathRef.current,
      runStartedAt: runStartedRef.current,
      pausedAccumMs: pausedAccumRef.current,
      pauseStartedAt: pauseStartedRef.current,
    });
  }, [status, path]);

  // ── 퍼시스턴스: pagehide / visibilitychange / 주기적 저장 ────────────────
  useEffect(() => {
    const flush = () => {
      if (statusRef.current === "idle" || runStartedRef.current == null) return;
      saveWorkout({
        status: statusRef.current as "running" | "paused",
        path: pathRef.current,
        runStartedAt: runStartedRef.current,
        pausedAccumMs: pausedAccumRef.current,
        pauseStartedAt: pauseStartedRef.current,
      });
    };

    const onVisibility = () => { if (document.hidden) flush(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);

    const timer = setInterval(() => {
      if (statusRef.current === "running") flush();
    }, SAVE_INTERVAL_MS);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      clearInterval(timer);
    };
  }, []);

  // ── GPS 유틸 ──────────────────────────────────────────────────────────────
  const clearWatch = useCallback(() => {
    if (stopWatchRef.current) {
      stopWatchRef.current();
      stopWatchRef.current = null;
    }
  }, []);

  const peekSpeedMps = useCallback(
    (coords: GeoCoords, point: LatLng, now: number): number | null => {
      let speed = coords.speed ?? null;
      if (speed == null && lastRawPosRef.current && lastPosTimeRef.current) {
        speed = computeSpeedMps(lastRawPosRef.current, point, now - lastPosTimeRef.current);
      }
      return speed;
    },
    [],
  );

  const commitRawPosition = useCallback((point: LatLng, now: number) => {
    lastRawPosRef.current = point;
    lastPosTimeRef.current = now;
  }, []);

  const appendPosition = useCallback(
    (coords: GeoCoords) => {
      if (statusRef.current !== "running") return;
      setGeoError(null);
      const point: LatLng = { lat: coords.latitude, lng: coords.longitude };
      setPosition(point);

      const now = Date.now();
      const accuracyM = normalizeGpsAccuracyM(coords.accuracy);
      const speedMps = peekSpeedMps(coords, point, now);

      const accuracyRecent = pushAccuracySample(
        vehicleStateRef.current.accuracyRecent,
        now,
        accuracyM,
      );

      const vehicle = evaluateVehicleTier({
        speedMps,
        accuracyM,
        nowMs: now,
        state: { ...vehicleStateRef.current, accuracyRecent },
      });

      vehicleStateRef.current = {
        tier: vehicle.tier,
        suspectHighSinceMs: vehicle.suspectHighSinceMs,
        confirmedHighSinceMs: vehicle.confirmedHighSinceMs,
        lowSpeedSinceMs: vehicle.lowSpeedSinceMs,
        weakGpsSinceMs: vehicle.weakGpsSinceMs,
        accuracyRecent: vehicle.accuracyRecent,
      };
      setVehicleTier(vehicle.tier);

      if (vehicle.blockPathPoints) return;

      const reanchor = vehicle.reanchorNextPoint;

      setPath((prev) => {
        const last = prev[prev.length - 1] ?? null;
        if (!reanchor && last && !shouldAppendPoint(last, point)) return prev;

        const increment =
          vehicle.blockDistance || reanchor || !last
            ? 0
            : haversineMeters(last, point);
        distanceAccumRef.current += increment;
        const next = [...prev, point];
        setDistanceM(distanceAccumRef.current);
        return next;
      });

      commitRawPosition(point, now);
    },
    [peekSpeedMps, commitRawPosition],
  );

  const startWatch = useCallback(() => {
    const blocked = geolocationBlockedReason();
    if (blocked) {
      setGeoError(blocked);
      return;
    }
    setGeoError(null);
    clearWatch();
    startBackgroundWatch(
      (coords) => {
        setGeoError(null);
        appendPosition(coords);
      },
      (msg) => setGeoError(msg),
      bgNotification?.title ?? "운동 기록 중",
      bgNotification?.message ?? "RunRace가 백그라운드에서 경로를 기록하고 있습니다.",
    ).then((stop) => {
      stopWatchRef.current = stop;
    });
  }, [appendPosition, clearWatch, bgNotification?.title, bgNotification?.message]);

  // ── 타이머 ────────────────────────────────────────────────────────────────
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

  // ── 마운트 시 세션 복원 (탭 이탈 ≠ 일시정지, running이면 GPS 재개) ───────
  useEffect(() => {
    const saved = loadWorkout();
    if (!saved) return;

    runStartedRef.current = saved.runStartedAt;
    pausedAccumRef.current = saved.pausedAccumMs;
    pathRef.current = saved.path;
    setPath(saved.path);
    const restoredDistance = pathDistanceMeters(saved.path);
    distanceAccumRef.current = restoredDistance;
    setDistanceM(restoredDistance);

    if (saved.status === "running") {
      pauseStartedRef.current = null;
      setElapsedSec(
        computeElapsedSec(saved.runStartedAt, saved.pausedAccumMs, null),
      );
      setStatus("running");
      setIsRestored(false);
      pendingResumeWatchRef.current = true;
    } else {
      pauseStartedRef.current = saved.pauseStartedAt;
      setElapsedSec(
        computeElapsedSec(
          saved.runStartedAt,
          saved.pausedAccumMs,
          saved.pauseStartedAt,
        ),
      );
      setStatus("paused");
      setIsRestored(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!pendingResumeWatchRef.current) return;
    pendingResumeWatchRef.current = false;
    startWatch();
  }, [startWatch]);

  // ── 초기 위치 획득 ────────────────────────────────────────────────────────
  useEffect(() => {
    const blocked = geolocationBlockedReason();
    if (blocked) {
      setGeoError(blocked);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoError(null);
      },
      (err) => setGeoError(geolocationErrorMessage(err)),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60_000 },
    );
  }, []);

  // ── 공개 액션 ─────────────────────────────────────────────────────────────
  const start = useCallback(() => {
    setPath([]);
    distanceAccumRef.current = 0;
    setDistanceM(0);
    setElapsedSec(0);
    vehicleStateRef.current = resetVehicleState();
    setVehicleTier("normal");
    setIsRestored(false);
    pausedAccumRef.current = 0;
    pauseStartedRef.current = null;
    runStartedRef.current = Date.now();
    lastRawPosRef.current = null;
    lastPosTimeRef.current = null;
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
    // 치팅 상태 리셋 — 재개 후 새로 측정
    vehicleStateRef.current = resetVehicleState();
    setVehicleTier("normal");
    setIsRestored(false);
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
    const finalDistance = Math.round(distanceAccumRef.current);

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
    clearWorkout(); // 완료 시 저장된 세션 삭제
    pauseStartedRef.current = null;
    pausedAccumRef.current = 0;
    runStartedRef.current = null;
    vehicleStateRef.current = resetVehicleState();
    distanceAccumRef.current = 0;
    setStatus("idle");
    setPath([]);
    setDistanceM(0);
    setElapsedSec(0);
    setVehicleTier("normal");
    setIsRestored(false);

    return snapshot;
  }, [clearWatch, position]);

  return {
    status,
    path,
    position,
    elapsedSec,
    distanceM,
    geoError,
    vehicleTier,
    isRestored,
    elapsedLabel: formatDuration(elapsedSec),
    paceLabel: formatPaceMinPerKm(distanceM, elapsedSec),
    calories: estimateCalories(distanceM),
    start,
    pause,
    resume,
    stop,
  };
}
