"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  estimateCalories,
  formatDuration,
  formatPaceMinPerKm,
  haversineMeters,
  pathDistanceMeters,
  shouldAppendPoint,
  type LatLng,
  geolocationBlockedReason,
  geolocationErrorMessage,
  type WorkoutFinishSnapshot,
  type WorkoutStatus,
} from "./workoutTrack";
import { saveWorkout, loadWorkout, clearWorkout } from "./workoutPersistence";

// ── 치팅 감지 임계값 ──────────────────────────────────────────────────────────
/** m/s — 이 속도 이상이 지속되면 탈것으로 간주 (≈23 km/h, 세계적인 마라토너 수준) */
const CHEAT_SPEED_MS = 6.5;
/** m/s — 이 속도 아래로 내려가면 치팅 해제 */
const CHEAT_CLEAR_SPEED_MS = 5.0;
/** ms — 고속이 이 시간만큼 지속돼야 치팅으로 확정 (단발 GPS 오차 방지) */
const CHEAT_CONFIRM_MS = 4_000;
/** DeviceMotion 표준편차(m/s²) — 이 값 이하면 매끄러운 탈것 동작으로 간주 */
const MOTION_VEHICLE_STDDEV = 1.5;
/** 분산 계산에 사용할 슬라이딩 윈도 크기(~10Hz * 3s) */
const MOTION_WINDOW = 30;

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

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 999; // 데이터 부족 → 활동적으로 가정
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

// ── 메인 훅 ───────────────────────────────────────────────────────────────────
export function useWorkoutSession() {
  // ── 기본 상태 ─────────────────────────────────────────────────────────────
  const [status, setStatus] = useState<WorkoutStatus>("idle");
  const [path, setPath] = useState<LatLng[]>([]);
  const [position, setPosition] = useState<LatLng | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [distanceM, setDistanceM] = useState(0);
  const [geoError, setGeoError] = useState<string | null>(null);
  // ── 치팅/복원 상태 ────────────────────────────────────────────────────────
  const [isCheating, setIsCheating] = useState(false);
  const [isRestored, setIsRestored] = useState(false);

  // ── 타이밍 레프 ───────────────────────────────────────────────────────────
  const watchIdRef = useRef<number | null>(null);
  const statusRef = useRef(status);
  const pathRef = useRef(path);
  const pausedAccumRef = useRef(0);
  const pauseStartedRef = useRef<number | null>(null);
  const runStartedRef = useRef<number | null>(null);

  // ── 치팅 감지 레프 ────────────────────────────────────────────────────────
  const highSpeedStartRef = useRef<number | null>(null);
  const lastPosTimeRef = useRef<number | null>(null);
  const lastRawPosRef = useRef<LatLng | null>(null);
  /** DeviceMotion 가속도 크기 슬라이딩 윈도 */
  const motionMagsRef = useRef<number[]>([]);
  /**
   * 현재 계산된 DeviceMotion 표준편차.
   * 초기값 999 = "데이터 없음 → 활동적으로 가정(치팅 미감지)".
   */
  const motionStdDevRef = useRef<number>(999);
  const isCheatingRef = useRef(false);

  // ── ref 동기화 ────────────────────────────────────────────────────────────
  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { pathRef.current = path; }, [path]);
  useEffect(() => { isCheatingRef.current = isCheating; }, [isCheating]);

  // ── 마운트 시 세션 복원 ───────────────────────────────────────────────────
  useEffect(() => {
    const saved = loadWorkout();
    if (!saved) return;

    runStartedRef.current = saved.runStartedAt;
    pausedAccumRef.current = saved.pausedAccumMs;

    // 페이지가 죽었을 때 "running" 상태였다면, savedAt을 일시정지 시작점으로 취급.
    // resume() 시 now - savedAt 이 추가 누적되어 중단 기간이 자동으로 제외된다.
    if (saved.status === "running") {
      pauseStartedRef.current = saved.savedAt;
    } else {
      pauseStartedRef.current = saved.pauseStartedAt;
    }

    pathRef.current = saved.path;
    setPath(saved.path);
    setDistanceM(pathDistanceMeters(saved.path));
    setElapsedSec(
      computeElapsedSec(
        saved.runStartedAt,
        saved.pausedAccumMs,
        // 복원 시 이미 "paused"로 처리하므로 pauseStarted를 반영
        saved.status === "running" ? saved.savedAt : saved.pauseStartedAt,
      ),
    );
    // 항상 "paused"로 복원 — GPS watch가 죽어있으므로 안전한 기본값
    setStatus("paused");
    setIsRestored(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // ── DeviceMotion 리스너 (선택적, best-effort) ─────────────────────────────
  useEffect(() => {
    const handler = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a || a.x == null || a.y == null || a.z == null) return;
      const mag = Math.sqrt(a.x ** 2 + a.y ** 2 + a.z ** 2);
      const buf = motionMagsRef.current;
      buf.push(mag);
      if (buf.length > MOTION_WINDOW) buf.shift();
      if (buf.length >= 5) {
        motionStdDevRef.current = stdDev(buf);
      }
    };

    window.addEventListener("devicemotion", handler);
    return () => window.removeEventListener("devicemotion", handler);
  }, []);

  // ── GPS 유틸 ──────────────────────────────────────────────────────────────
  const clearWatch = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  /**
   * GPS 속도(coords.speed) 또는 연속 두 점 사이의 계산 속도로 치팅 여부를 판단한다.
   *
   * 치팅 확정 조건 (AND):
   *  1. 속도 > CHEAT_SPEED_MS 가 CHEAT_CONFIRM_MS 동안 지속
   *  2. DeviceMotion 표준편차 < MOTION_VEHICLE_STDDEV (매끄러운 탈것 동작)
   *     OR DeviceMotion 데이터 없음(GPS 속도만으로 판단)
   *
   * 조건 2가 거짓(높은 운동 분산)이면 빠른 러너로 간주해 false 반환.
   */
  const checkCheat = useCallback(
    (coords: GeolocationCoordinates, point: LatLng): boolean => {
      const now = Date.now();

      // GPS 기본 속도, 없으면 연속 두 점으로 계산
      let speed = coords.speed ?? null;
      if (speed == null && lastRawPosRef.current && lastPosTimeRef.current) {
        speed = computeSpeedMps(lastRawPosRef.current, point, now - lastPosTimeRef.current);
      }
      lastRawPosRef.current = point;
      lastPosTimeRef.current = now;

      if (speed == null) return false; // 속도 정보 없으면 치팅 판단 불가

      if (speed > CHEAT_SPEED_MS) {
        if (highSpeedStartRef.current == null) {
          highSpeedStartRef.current = now;
        }
        const sustained = now - highSpeedStartRef.current > CHEAT_CONFIRM_MS;
        if (!sustained) return isCheatingRef.current; // 확정 전: 기존 상태 유지

        // DeviceMotion 확인 — 데이터 없으면 GPS 속도만으로 판단
        const motionAvailable = motionMagsRef.current.length >= 5;
        const motionSuggestsRunning =
          motionAvailable && motionStdDevRef.current >= MOTION_VEHICLE_STDDEV;

        // 빠른 분산(달리기)이 감지되면 빠른 러너로 허용
        return !motionSuggestsRunning;
      }

      // 속도가 기준 이하로 내려오면 해제 (이력 현상 방지를 위해 낮은 임계값 사용)
      if (speed < CHEAT_CLEAR_SPEED_MS) {
        highSpeedStartRef.current = null;
        return false;
      }

      // 중간 속도 구간: 기존 상태 유지
      return isCheatingRef.current;
    },
    [],
  );

  const appendPosition = useCallback(
    (coords: GeolocationCoordinates) => {
      if (statusRef.current !== "running") return;
      const point: LatLng = { lat: coords.latitude, lng: coords.longitude };
      setPosition(point);

      const cheating = checkCheat(coords, point);
      setIsCheating(cheating);
      if (cheating) return; // 치팅 감지 시 경로에 점 추가하지 않음

      setPath((prev) => {
        const last = prev[prev.length - 1] ?? null;
        if (!shouldAppendPoint(last, point)) return prev;
        const next = [...prev, point];
        setDistanceM(pathDistanceMeters(next));
        return next;
      });
    },
    [checkCheat],
  );

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

  // iOS 13+ DeviceMotion 권한 요청 (start() 호출 — 사용자 제스처 컨텍스트)
  const requestMotionPermission = useCallback(async () => {
    try {
      const dme = DeviceMotionEvent as unknown as {
        requestPermission?: () => Promise<"granted" | "denied">;
      };
      if (typeof dme.requestPermission === "function") {
        await dme.requestPermission();
      }
    } catch {
      // 권한 거부 or 지원 안 함 — GPS 단독 모드로 계속
    }
  }, []);

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

  useEffect(() => () => clearWatch(), [clearWatch]);

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
    // iOS DeviceMotion 권한 요청 (fire-and-forget, 실패해도 시작은 진행)
    void requestMotionPermission();

    setPath([]);
    setDistanceM(0);
    setElapsedSec(0);
    setIsCheating(false);
    setIsRestored(false);
    pausedAccumRef.current = 0;
    pauseStartedRef.current = null;
    runStartedRef.current = Date.now();
    highSpeedStartRef.current = null;
    lastRawPosRef.current = null;
    lastPosTimeRef.current = null;
    motionMagsRef.current = [];
    motionStdDevRef.current = 999;
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
  }, [startWatch, requestMotionPermission]);

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
    highSpeedStartRef.current = null;
    setIsCheating(false);
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
    clearWorkout(); // 완료 시 저장된 세션 삭제
    pauseStartedRef.current = null;
    pausedAccumRef.current = 0;
    runStartedRef.current = null;
    highSpeedStartRef.current = null;
    setStatus("idle");
    setPath([]);
    setDistanceM(0);
    setElapsedSec(0);
    setIsCheating(false);
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
    isCheating,
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
