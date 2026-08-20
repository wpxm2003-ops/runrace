"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  estimateCalories,
  evaluateVehicleTier,
  formatClock,
  haversineMeters,
  idleAutoPauseAt,
  normalizeGpsAccuracyM,
  pickWorkoutStartSeed,
  creditedPathDistanceMeters,
  pushAccuracySample,
  shouldAppendPoint,
  slideIdleAnchor,
  type IdleAnchor,
  type LatLng,
  type VehicleDetectState,
  type VehicleTier,
  geolocationBlockedReason,
  geolocationErrorMessage,
  shouldRestartGpsWatch,
  shouldResetIdleAnchorAfterForegroundGap,
  WORKOUT_START_FIX_MAX_AGE_MS,
  type WorkoutFinishSnapshot,
  type WorkoutStartFix,
  type WorkoutStatus,
} from "./workoutTrack";
import { saveWorkout, loadWorkoutForOwner, clearWorkout } from "./workoutPersistence";
import { useUnit } from "./UnitContext";
import { formatPace } from "./units";
import { avgPaceSecPerKm } from "./paceMath";
import { toWallClockIso } from "./format";
import { startBackgroundWatch, type GeoCoords } from "./backgroundGeo";
import { track } from "./analytics";
import { Capacitor } from "@capacitor/core";
import { waitForNativePermissions } from "./nativePermissions";
import { createClientWorkoutId } from "./workoutRequestId";

// ── 퍼시스턴스 ────────────────────────────────────────────────────────────────
const SAVE_INTERVAL_MS = 10_000;
const WARMUP_FIX_BUFFER_SIZE = 6;
const GPS_WATCHDOG_POLL_MS = 5_000;
const GPS_RESTART_DEBOUNCE_MS = 2_000;

// ── 헬퍼 ──────────────────────────────────────────────────────────────────────
function computeElapsedSec(
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
    recoveringFromWeakGps: false,
    hasHadGoodFix: false,
    accuracyRecent: [],
  };
}

type WorkoutSessionAuth = {
  /** Firebase가 확정한 현재 사용자 UID. hint 같은 낙관값은 사용하지 않는다. */
  currentUid: string | null;
  loading: boolean;
};

// ── 메인 훅 ───────────────────────────────────────────────────────────────────
export function useWorkoutSession(
  bgNotification: { title: string; message: string } | undefined,
  authState: WorkoutSessionAuth,
) {
  const { unit } = useUnit();
  const pathname = usePathname();
  const currentUidRef = useRef(authState.currentUid);
  const authLoadingRef = useRef(authState.loading);
  // 인증 변경과 같은 렌더 안에서 GPS 콜백·액션 가드가 즉시 새 UID를 보게 한다.
  currentUidRef.current = authState.currentUid;
  authLoadingRef.current = authState.loading;
  // ── 기본 상태 ─────────────────────────────────────────────────────────────
  const [status, setStatus] = useState<WorkoutStatus>("idle");
  const [path, setPath] = useState<LatLng[]>([]);
  const [position, setPosition] = useState<LatLng | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [distanceM, setDistanceM] = useState(0);
  const [geoError, setGeoError] = useState<string | null>(null);
  // ── 치팅 감지 상태 ────────────────────────────────────────────────────────
  const [vehicleTier, setVehicleTier] = useState<VehicleTier>("normal");
  const [autoPaused, setAutoPaused] = useState(false);

  // ── 타이밍 레프 ───────────────────────────────────────────────────────────
  const stopWatchRef = useRef<(() => void) | null>(null);
  const watchStartedAtRef = useRef<number | null>(null);
  const lastGpsFixAtRef = useRef<number | null>(null);
  const lastWatchRestartAtRef = useRef<number | null>(null);
  const statusRef = useRef(status);
  const pathRef = useRef(path);
  const pausedAccumRef = useRef(0);
  const pauseStartedRef = useRef<number | null>(null);
  const runStartedRef = useRef<number | null>(null);
  const autoPausedRef = useRef(false);
  /** 시작 시 고정한 Firebase UID. 현재 인증 UID와 다르면 모든 액션·GPS 반영을 차단한다. */
  const sessionOwnerUidRef = useRef<string | null>(null);
  const restoreAttemptedUidRef = useRef<string | null>(null);
  /** 방치 자동 일시정지 기준점 — 마지막으로 충분한 전진(100m)이 확인된 시각·누적 거리. */
  const idleAnchorRef = useRef<IdleAnchor | null>(null);
  /** 시작 직전의 양호한 GPS 한 점을 녹화 시작점으로 넘기기 위한 짧은 예열 버퍼. */
  const warmupFixesRef = useRef<WorkoutStartFix[]>([]);

  // ── 탈것 Tiered 감지 레프 ─────────────────────────────────────────────────
  const vehicleStateRef = useRef<VehicleDetectState>(resetVehicleState());
  const lastPosTimeRef = useRef<number | null>(null);
  const lastRawPosRef = useRef<LatLng | null>(null);
  const distanceAccumRef = useRef(0);
  /** 경로에 마지막으로 추가된 점 — 증분 거리 계산용(setState 업데이터 밖에서 유지). */
  const lastPathPointRef = useRef<LatLng | null>(null);
  /**
   * 마지막 포인트가 기록된 벽시계 시각. 방치 일시정지의 소급 하한 — 이보다 과거로
   * 소급하면 재개 후 t(경과시간)가 이미 기록된 포인트보다 뒤로 돌아가(비내림차순 위반)
   * 서버가 저장을 거부한다.
   */
  const lastAppendWallMsRef = useRef<number | null>(null);
  /**
   * 다음 GPS 포인트를 재정박(거리 0으로 추가)할지.
   * 일시정지·앱 종료 중 이동을 직선으로 이어 거리에 합산하는 것을 막는다.
   */
  const reanchorNextRef = useRef(false);

  // ── ref 동기화 ────────────────────────────────────────────────────────────
  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { pathRef.current = path; }, [path]);

  const pendingResumeWatchRef = useRef(false);

  // ── 퍼시스턴스: 상태 전환(running↔paused) 시 즉시 저장 ────────────────────
  // 경로(path)는 의존성에서 제외한다 — GPS 포인트마다 재저장하면 매번 전체 배열을
  // JSON.stringify 하여 O(n^2)로 커진다. 경로 스냅샷은 아래 주기적 flush(SAVE_INTERVAL_MS)
  // + pagehide/visibilitychange flush가 담당하며, 이 효과는 상태 전환만 즉시 반영한다.
  useEffect(() => {
    const ownerUid = sessionOwnerUidRef.current;
    if (status === "idle" || runStartedRef.current == null || ownerUid == null) return;
    saveWorkout({
      ownerUid,
      status: status as "running" | "paused",
      path: pathRef.current,
      distanceM: distanceAccumRef.current,
      runStartedAt: runStartedRef.current,
      pausedAccumMs: pausedAccumRef.current,
      pauseStartedAt: pauseStartedRef.current,
      idleAnchor: idleAnchorRef.current ?? undefined,
      autoPaused: autoPausedRef.current,
    });
  }, [status, autoPaused]);

  // ── 퍼시스턴스: pagehide / visibilitychange / 주기적 저장 ────────────────
  useEffect(() => {
    const flush = () => {
      const ownerUid = sessionOwnerUidRef.current;
      if (statusRef.current === "idle" || runStartedRef.current == null || ownerUid == null) return;
      saveWorkout({
        ownerUid,
        status: statusRef.current as "running" | "paused",
        path: pathRef.current,
        distanceM: distanceAccumRef.current,
        runStartedAt: runStartedRef.current,
        pausedAccumMs: pausedAccumRef.current,
        pauseStartedAt: pauseStartedRef.current,
        idleAnchor: idleAnchorRef.current ?? undefined,
        autoPaused: autoPausedRef.current,
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
  /**
   * 워처 등록 세대 토큰. 네이티브 addWatcher는 비동기(권한 다이얼로그로 수초 걸릴 수 있음)라,
   * 등록이 끝나기 전에 pause/stop/재시작이 오면 clearWatch가 멈출 대상이 아직 없다.
   * 그대로 두면 낡은 워처가 등록 완료 후 영영 살아남는다(배터리·상시 알림 누수).
   * clearWatch가 세대를 올리고, 등록 완료 시 세대가 달라져 있으면 즉시 자기를 해제한다.
   */
  const watchSeqRef = useRef(0);
  const clearWatch = useCallback(() => {
    watchSeqRef.current++;
    watchStartedAtRef.current = null;
    if (stopWatchRef.current) {
      stopWatchRef.current();
      stopWatchRef.current = null;
    }
  }, []);

  /** 현재 확정 인증 사용자가 이 라이브 세션의 소유자인지 원자적으로 확인한다. */
  const isCurrentSessionOwner = useCallback((expectedUid?: string): boolean => {
    const currentUid = currentUidRef.current;
    return (
      !authLoadingRef.current
      && currentUid != null
      && sessionOwnerUidRef.current === currentUid
      && (expectedUid == null || expectedUid === currentUid)
    );
  }, []);

  /**
   * 저장소는 건드리지 않고 라이브 상태만 비운다. 인증 계정이 바뀔 때 A의 세션을 먼저
   * A 소유로 일시정지 저장한 뒤 이 함수를 호출해 B 화면·GPS 콜백에서 완전히 분리한다.
   */
  const resetRuntime = useCallback(() => {
    statusRef.current = "idle";
    pathRef.current = [];
    sessionOwnerUidRef.current = null;
    pendingResumeWatchRef.current = false;
    pauseStartedRef.current = null;
    pausedAccumRef.current = 0;
    runStartedRef.current = null;
    autoPausedRef.current = false;
    idleAnchorRef.current = null;
    warmupFixesRef.current = [];
    vehicleStateRef.current = resetVehicleState();
    distanceAccumRef.current = 0;
    lastPathPointRef.current = null;
    lastAppendWallMsRef.current = null;
    lastRawPosRef.current = null;
    lastPosTimeRef.current = null;
    watchStartedAtRef.current = null;
    lastGpsFixAtRef.current = null;
    lastWatchRestartAtRef.current = null;
    reanchorNextRef.current = false;

    setStatus("idle");
    setPath([]);
    setPosition(null);
    setDistanceM(0);
    setElapsedSec(0);
    setGeoError(null);
    setVehicleTier("normal");
    setAutoPaused(false);
  }, []);

  /**
   * 방치 자동 일시정지 — 30분간 100m도 못 나아갔으면 운동 종료를 잊은 것으로 보고
   * 수동 일시정지와 동일한 상태(재개/종료 버튼)로 전환한다. 재개는 사용자가 직접 한다.
   * 일시정지 시각은 앵커(마지막 전진 확인 시각)로 소급해, 방치된 시간이 활동시간·
   * 페이스·기록에 섞이지 않는다. 짧은 휴식(신호 대기·인터벌)은 창에 한참 못 미쳐
   * 절대 발동하지 않는다 — PB·유령 비교는 총 경과시간 기준을 유지한다.
   */
  /** 소급 하한 적용 — 마지막 기록 포인트보다 과거로는 일시정지를 소급하지 않는다(t 역행 방지). */
  const clampIdlePauseAt = useCallback((pausedAt: number): number => {
    const lastWall = lastAppendWallMsRef.current;
    return lastWall != null && lastWall > pausedAt ? lastWall : pausedAt;
  }, []);

  const autoPauseIfIdle = useCallback((nowMs: number): boolean => {
    if (
      !isCurrentSessionOwner()
      || statusRef.current !== "running"
      || idleAnchorRef.current == null
    ) {
      return false;
    }
    const rawPausedAt = idleAutoPauseAt(idleAnchorRef.current, nowMs);
    if (rawPausedAt == null) return false;
    const pausedAt = clampIdlePauseAt(rawPausedAt);

    pauseStartedRef.current = pausedAt;
    autoPausedRef.current = true;
    setAutoPaused(true);
    setStatus("paused");
    statusRef.current = "paused";
    clearWatch();
    if (runStartedRef.current != null) {
      setElapsedSec(
        computeElapsedSec(runStartedRef.current, pausedAccumRef.current, pausedAt),
      );
    }
    void track("running_auto_pause");
    return true;
  }, [clearWatch, clampIdlePauseAt, isCurrentSessionOwner]);

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
      if (!isCurrentSessionOwner() || statusRef.current !== "running") return;
      setGeoError(null);
      const now = Date.now();
      lastGpsFixAtRef.current = now;
      const accuracyM = normalizeGpsAccuracyM(coords.accuracy);
      const point: LatLng = {
        lat: coords.latitude,
        lng: coords.longitude,
      };
      setPosition(point);

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
        recoveringFromWeakGps: vehicle.recoveringFromWeakGps,
        hasHadGoodFix: vehicle.hasHadGoodFix,
        accuracyRecent: vehicle.accuracyRecent,
      };
      setVehicleTier(vehicle.tier);

      // Even when we suppress path/distance accumulation, keep the raw GPS baseline
      // current so recovery and speed estimation use the newest fix.
      commitRawPosition(point, now);
      const last = lastPathPointRef.current;

      if (autoPauseIfIdle(now)) return;
      if (vehicle.blockPathPoints) return;

      const reanchor = vehicle.reanchorNextPoint || reanchorNextRef.current;
      const elapsedMs =
        runStartedRef.current != null
          ? now - runStartedRef.current - pausedAccumRef.current
          : undefined;
      const pointWithT: LatLng = {
        ...point,
        ...(elapsedMs != null ? { t: elapsedMs } : {}),
        // 거리와 무관한 명시적 단절 마커. 일시정지 중 120m 이하를 이동했더라도
        // 저장 후 PB·스플릿·유령 계산이 이 구간을 다시 거리로 합산하지 않게 한다.
        ...(reanchor && last ? { breakBefore: true } : {}),
      };

      // 증분 계산·ref 변이는 업데이터 밖에서 한다 — setState 업데이터는 순수해야 하며
      // (StrictMode·concurrent 렌더에서 재실행될 수 있음) 안에 부수효과를 두면 거리가
      // 이중 가산될 수 있다. GPS 콜백은 순차 실행이라 ref 기반 계산이 안전하다.
      if (!reanchor && last && !shouldAppendPoint(last, pointWithT)) return;

      const increment =
        vehicle.blockDistance || reanchor || !last
          ? 0
          : haversineMeters(last, pointWithT);
      distanceAccumRef.current += increment;
      lastPathPointRef.current = pointWithT;
      lastAppendWallMsRef.current = now;
      reanchorNextRef.current = false;
      // 인정 거리 100m + 공간 폭 50m를 함께 채울 때 방치 판정 창을 새로 시작한다.
      // 차단(blockDistance) 중에는 앵커가 안 밀리므로, 탑승 상태가 이어지면 창이 차오른다.
      if (!vehicle.blockDistance && idleAnchorRef.current != null) {
        idleAnchorRef.current = slideIdleAnchor(
          idleAnchorRef.current,
          now,
          distanceAccumRef.current,
          point,
        );
      }
      setPath((prev) => [...prev, pointWithT]);
      setDistanceM(distanceAccumRef.current);
    },
    [peekSpeedMps, commitRawPosition, autoPauseIfIdle, isCurrentSessionOwner],
  );

  const startWatch = useCallback(() => {
    const watchOwnerUid = sessionOwnerUidRef.current;
    if (watchOwnerUid == null || !isCurrentSessionOwner(watchOwnerUid)) return;
    const blocked = geolocationBlockedReason();
    if (blocked) {
      setGeoError(blocked);
      return;
    }
    setGeoError(null);
    clearWatch();
    watchStartedAtRef.current = Date.now();
    const seq = watchSeqRef.current;
    const isLiveWatch = () =>
      watchSeqRef.current === seq
      && statusRef.current === "running"
      && isCurrentSessionOwner(watchOwnerUid);
    startBackgroundWatch(
      (coords) => {
        if (!isLiveWatch()) return;
        setGeoError(null);
        appendPosition(coords);
      },
      (msg) => {
        if (isLiveWatch()) setGeoError(msg);
      },
      bgNotification?.title ?? "운동 기록 중",
      bgNotification?.message ?? "RunRace가 백그라운드에서 경로를 기록하고 있습니다.",
    )
      .then((stop) => {
        // 등록되는 사이 pause/stop/재시작이 있었으면 이 워처는 낡은 것 — 즉시 해제(누수 방지).
        if (!isLiveWatch()) {
          stop();
          return;
        }
        stopWatchRef.current = stop;
      })
      .catch((e: unknown) => {
        // addWatcher 자체가 실패(플러그인 초기화·권한 거부 reject)하면 기록이 조용히
        // 시작되지 않는다 — 배너로 드러내 사용자가 알 수 있게 한다.
        if (isLiveWatch()) {
          setGeoError(e instanceof Error ? e.message : String(e));
        }
      });
  }, [
    appendPosition,
    clearWatch,
    isCurrentSessionOwner,
    bgNotification?.title,
    bgNotification?.message,
  ]);

  const restartWatch = useCallback((reason: "foreground" | "stale") => {
    if (statusRef.current !== "running" || !isCurrentSessionOwner()) return;
    const now = Date.now();
    if (
      lastWatchRestartAtRef.current != null
      && now - lastWatchRestartAtRef.current < GPS_RESTART_DEBOUNCE_MS
    ) {
      return;
    }
    lastWatchRestartAtRef.current = now;
    // If the WebView bridge was asleep while locked, its last callback looks
    // identical to a long rest. Reset the idle window on foreground return so
    // the first recovered GPS fix does not falsely auto-pause the workout.
    // A correctly running native watcher keeps lastGpsFixAt fresh, so this is
    // only applied after a real callback gap.
    if (
      reason === "foreground"
      && shouldResetIdleAnchorAfterForegroundGap(now, lastGpsFixAtRef.current)
    ) {
      idleAnchorRef.current = { timeMs: now, distanceM: distanceAccumRef.current };
    }
    // Never join the last pre-suspension point to the first recovered fix.
    reanchorNextRef.current = true;
    lastRawPosRef.current = null;
    lastPosTimeRef.current = null;
    startWatch();
    void track("running_gps_watch_restart", { reason });
  }, [isCurrentSessionOwner, startWatch]);

  // Android may reclaim the WebView bridge or the native location callback while
  // the app is backgrounded. Re-register the watcher whenever the app becomes
  // active; the sequence guard makes late callbacks from the old watcher harmless.
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

  // A watcher can resolve successfully yet stop delivering callbacks. While the
  // app is visible, recover it automatically instead of leaving distance frozen.
  useEffect(() => {
    if (status !== "running") return;
    const id = window.setInterval(() => {
      if (document.hidden || statusRef.current !== "running") return;
      if (
        shouldRestartGpsWatch(
          Date.now(),
          watchStartedAtRef.current,
          lastGpsFixAtRef.current,
        )
      ) {
        restartWatch("stale");
      }
    }, GPS_WATCHDOG_POLL_MS);
    return () => clearInterval(id);
  }, [status, restartWatch]);

  // ── 타이머 ────────────────────────────────────────────────────────────────
  // 방치 판정도 여기서 함께 돈다 — 정지 중엔 네이티브 GPS 콜백(distanceFilter)이
  // 침묵하므로 콜백만으로는 발동 시점을 놓친다.
  useEffect(() => {
    if (status !== "running") return;
    const id = window.setInterval(() => {
      if (!runStartedRef.current) return;
      if (autoPauseIfIdle(Date.now())) return;
      setElapsedSec(
        computeElapsedSec(
          runStartedRef.current,
          pausedAccumRef.current,
          pauseStartedRef.current,
        ),
      );
    }, 1000);
    return () => clearInterval(id);
  }, [status, autoPauseIfIdle]);

  /**
   * Firebase 계정이 바뀌면 현재 런을 원래 소유자 명의의 paused 스냅샷으로 동결한다.
   * 이후 워처와 메모리 상태를 즉시 비워 새 계정이 경로를 보거나 저장하지 못하게 한다.
   */
  const suspendForAuthChange = useCallback(
    (ownerUid: string) => {
      if (statusRef.current !== "idle" && runStartedRef.current != null) {
        const now = Date.now();
        if (statusRef.current === "running") {
          const inferred =
            idleAnchorRef.current != null
              ? idleAutoPauseAt(idleAnchorRef.current, now)
              : null;
          pauseStartedRef.current =
            inferred != null ? clampIdlePauseAt(inferred) : now;
          autoPausedRef.current = inferred != null;
          statusRef.current = "paused";
        }
        saveWorkout({
          ownerUid,
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
    },
    [clampIdlePauseAt, clearWatch, resetRuntime],
  );

  // 인증 변경은 effect가 실행되기 전 렌더부터 아래 반환값에서 마스킹되며, 여기서 실제 워처도 끈다.
  useEffect(() => {
    if (authState.loading) return;
    const ownerUid = sessionOwnerUidRef.current;
    if (ownerUid != null && ownerUid !== authState.currentUid) {
      suspendForAuthChange(ownerUid);
    } else if (authState.currentUid == null) {
      restoreAttemptedUidRef.current = null;
    }
  }, [
    authState.loading,
    authState.currentUid,
    suspendForAuthChange,
  ]);

  // ── 인증 확정 후 소유자 일치 세션만 복원 ─────────────────────────────────
  useEffect(() => {
    if (authState.loading || authState.currentUid == null) return;
    const ownerUid = authState.currentUid;
    if (statusRef.current !== "idle" || restoreAttemptedUidRef.current === ownerUid) return;
    restoreAttemptedUidRef.current = ownerUid;

    const saved = loadWorkoutForOwner(ownerUid);
    if (!saved) return;
    sessionOwnerUidRef.current = ownerUid;

    runStartedRef.current = saved.runStartedAt;
    pausedAccumRef.current = saved.pausedAccumMs;
    pathRef.current = saved.path;
    setPath(saved.path);
    lastPathPointRef.current = saved.path[saved.path.length - 1] ?? null;
    setPosition(lastPathPointRef.current);
    // 복원 후 첫 GPS 포인트는 재정박 — 앱이 죽어있던 동안의 이동을 직선으로 이어
    // 거리에 합산하지 않는다(120m 넘는 갭은 지도에서 점선으로 표시됨).
    reanchorNextRef.current = true;
    // 저장된 라이브 거리를 우선 사용 — 경로 재계산은 안티치트로 차단됐던 구간·추적 끊김을
    // 직선으로 이어 거리를 부풀린다. 구버전 스냅샷만 갭 제외 재계산으로 폴백.
    const restoredDistance = saved.distanceM ?? creditedPathDistanceMeters(saved.path);
    distanceAccumRef.current = restoredDistance;
    setDistanceM(restoredDistance);

    // 방치 판정 앵커 복원 — 구버전 스냅샷(idleAnchor 없음)은 마지막 이동/저장 시각으로 근사.
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
    // 소급 하한 복원 — 마지막 포인트의 t(경과 ms)를 벽시계 시각으로 환산한다.
    const lastT = lastPathPointRef.current?.t;
    lastAppendWallMsRef.current =
      lastT != null ? saved.runStartedAt + saved.pausedAccumMs + lastT : null;

    if (saved.status === "running") {
      const rawIdlePausedAt = idleAutoPauseAt(idleAnchorRef.current, Date.now());
      const idlePausedAt = rawIdlePausedAt != null ? clampIdlePauseAt(rawIdlePausedAt) : null;
      if (idlePausedAt != null) {
        // 백그라운드에 30분+ 방치된 세션 — 운동 종료를 잊은 것으로 보고 앵커 시각으로
        // 소급해 일시정지 상태로 복원한다. 재개/종료는 사용자가 결정한다(자동 재개 없음).
        pauseStartedRef.current = idlePausedAt;
        autoPausedRef.current = true;
        setAutoPaused(true);
        setElapsedSec(
          computeElapsedSec(saved.runStartedAt, saved.pausedAccumMs, idlePausedAt),
        );
        setStatus("paused");
        statusRef.current = "paused";
      } else {
        pauseStartedRef.current = null;
        autoPausedRef.current = false;
        setAutoPaused(false);
        setElapsedSec(computeElapsedSec(saved.runStartedAt, saved.pausedAccumMs, null));
        setStatus("running");
        statusRef.current = "running";
        pendingResumeWatchRef.current = true;
      }
    } else {
      // 일시정지 중 재구성 — 자동 일시정지였다면 배너·종료 시각 보정을 위해 플래그 유지.
      autoPausedRef.current = saved.autoPaused === true;
      setAutoPaused(saved.autoPaused === true);
      pauseStartedRef.current = saved.pauseStartedAt;
      setElapsedSec(
        computeElapsedSec(
          saved.runStartedAt,
          saved.pausedAccumMs,
          saved.pauseStartedAt,
        ),
      );
      setStatus("paused");
      statusRef.current = "paused";
    }
  }, [
    authState.loading,
    authState.currentUid,
    clampIdlePauseAt,
  ]);

  useEffect(() => {
    if (!pendingResumeWatchRef.current) return;
    pendingResumeWatchRef.current = false;
    startWatch();
  }, [startWatch]);

  // ── GPS 예열 (운동 화면 idle 동안 미리 위성 확보) ──────────────────────────
  // 운동 화면에 있는 동안(idle) 고정밀 위치 워치를 돌려 GPS 라디오를 미리 켜둔다.
  // 시작을 누를 땐 이미 위성이 잡혀 있어, 콜드스타트 지연·초반 정확도 저하로 거리·경로가
  // 한동안 안 찍히던 문제를 없앤다. running/paused면 녹화 워치가 GPS를 잡으므로 건너뛴다.
  // 이 훅은 앱 전역 프로바이더(AppShell)에 마운트되므로 반드시 /workout에서만 예열한다 —
  // 안 그러면 홈·크루 등 모든 화면에서 GPS가 상시 켜져 배터리를 소모한다.
  useEffect(() => {
    if (
      authState.loading
      || authState.currentUid == null
      || status !== "idle"
      || pathname !== "/workout"
    ) {
      return;
    }
    let cancelled = false;
    let watchId: number | null = null;
    const warmupUid = authState.currentUid;
    warmupFixesRef.current = [];

    async function warmUp() {
      const blocked = geolocationBlockedReason();
      if (blocked) {
        setGeoError(blocked);
        return;
      }
      if (Capacitor.isNativePlatform()) {
        await waitForNativePermissions();
      }
      if (cancelled || typeof navigator === "undefined" || !navigator.geolocation) return;
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (
            cancelled
            || currentUidRef.current !== warmupUid
            || statusRef.current !== "idle"
          ) {
            return;
          }
          const receivedAtMs = Date.now();
          warmupFixesRef.current = [
            ...warmupFixesRef.current,
            {
              ownerUid: warmupUid,
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracyM: normalizeGpsAccuracyM(pos.coords.accuracy),
              fixAtMs: pos.timestamp,
              receivedAtMs,
            },
          ].slice(-WARMUP_FIX_BUFFER_SIZE);
          setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setGeoError(null);
        },
        (err) => {
          if (
            !cancelled
            && currentUidRef.current === warmupUid
            && statusRef.current === "idle"
          ) {
            setGeoError(geolocationErrorMessage(err));
          }
        },
        { enableHighAccuracy: true, maximumAge: 1_000, timeout: 30_000 },
      );
    }

    warmUp();
    return () => {
      cancelled = true;
      warmupFixesRef.current = [];
      if (watchId != null && typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [authState.loading, authState.currentUid, status, pathname]);

  // ── 공개 액션 ─────────────────────────────────────────────────────────────
  const start = useCallback((expectedUid: string) => {
    if (
      authLoadingRef.current
      || expectedUid !== currentUidRef.current
      || currentUidRef.current == null
      || statusRef.current !== "idle"
    ) {
      return;
    }
    const blocked = geolocationBlockedReason();
    if (blocked) {
      setGeoError(blocked);
      return;
    }
    const now = Date.now();
    const startSeed = pickWorkoutStartSeed(
      warmupFixesRef.current,
      expectedUid,
      now,
    );
    warmupFixesRef.current = [];
    const initialPath = startSeed ? [startSeed] : [];
    sessionOwnerUidRef.current = expectedUid;
    restoreAttemptedUidRef.current = expectedUid;
    setPath(initialPath);
    pathRef.current = initialPath;
    distanceAccumRef.current = 0;
    lastPathPointRef.current = startSeed;
    lastAppendWallMsRef.current = startSeed ? now : null;
    reanchorNextRef.current = false;
    setDistanceM(0);
    setElapsedSec(0);
    vehicleStateRef.current = resetVehicleState();
    setVehicleTier("normal");
    pausedAccumRef.current = 0;
    pauseStartedRef.current = null;
    runStartedRef.current = now;
    autoPausedRef.current = false;
    idleAnchorRef.current = startSeed
      ? slideIdleAnchor({ timeMs: now, distanceM: 0 }, now, 0, startSeed)
      : { timeMs: now, distanceM: 0 };
    setAutoPaused(false);
    // 첫 라이브 fix의 OS speed가 비어도 seed→fix 속도를 검증해 GPS 점프를 거리로 세지 않는다.
    lastRawPosRef.current = startSeed;
    lastPosTimeRef.current = startSeed ? now : null;
    setStatus("running");
    statusRef.current = "running";
    if (startSeed) setPosition(startSeed);
    startWatch();
    // 같은 계정에서 직전 런을 끝내고 곧바로 새 런을 시작해도, 직전 getCurrentPosition
    // 콜백이 새 런의 첫 좌표로 들어오지 않도록 워처 세대를 함께 고정한다.
    const seedWatchSeq = watchSeqRef.current;
    void track("running_start");

    if (startSeed) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (
          watchSeqRef.current !== seedWatchSeq
          || !isCurrentSessionOwner(expectedUid)
          || statusRef.current !== "running"
          || lastPathPointRef.current != null
        ) {
          return;
        }
        const receivedAtMs = Date.now();
        const selected = pickWorkoutStartSeed(
          [{
            ownerUid: expectedUid,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracyM: normalizeGpsAccuracyM(pos.coords.accuracy),
            fixAtMs: pos.timestamp,
            receivedAtMs,
          }],
          expectedUid,
          receivedAtMs,
        );
        if (!selected) return;
        // 시드 포인트에는 고도를 싣지 않는다 — 시작 직후 fix의 고도는 수렴 전이라 신뢰 불가.
        const p: LatLng = {
          ...selected,
          // 시작 후에 얻은 콜드스타트 좌표는 실제 획득 시각을 기록한다.
          t: runStartedRef.current != null ? receivedAtMs - runStartedRef.current : 0,
        };
        setPosition(p);
        // 콜백이 GPS 워치보다 늦게 도착할 수 있다(최대 15초). 이미 워치가 경로를
        // 쌓기 시작했거나(초기 포인트 유실·거리 어긋남 방지) 그 사이 종료됐다면 시드하지 않는다.
        lastPathPointRef.current = p;
        lastAppendWallMsRef.current = receivedAtMs;
        lastRawPosRef.current = p;
        lastPosTimeRef.current = receivedAtMs;
        idleAnchorRef.current = slideIdleAnchor(
          { timeMs: runStartedRef.current ?? receivedAtMs, distanceM: 0 },
          receivedAtMs,
          0,
          p,
        );
        pathRef.current = [p];
        setPath([p]);
      },
      (err) => {
        if (
          watchSeqRef.current === seedWatchSeq
          && isCurrentSessionOwner(expectedUid)
          && statusRef.current === "running"
        ) {
          setGeoError(geolocationErrorMessage(err));
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: WORKOUT_START_FIX_MAX_AGE_MS,
        timeout: 15_000,
      },
    );
  }, [isCurrentSessionOwner, startWatch]);

  const pause = useCallback((expectedUid: string) => {
    if (!isCurrentSessionOwner(expectedUid) || statusRef.current !== "running") return;
    const now = Date.now();
    // 백그라운드에서 JS 타이머가 멈춘 채 사용자가 먼저 일시정지를 눌러도, 현재 시각으로
    // 덮기 전에 30분 방치 여부를 판정해 귀가 후 방치 시간을 소급 제외한다.
    if (autoPauseIfIdle(now)) return;
    pauseStartedRef.current = now;
    autoPausedRef.current = false;
    setAutoPaused(false);
    setStatus("paused");
    statusRef.current = "paused";
    clearWatch();
    void track("running_pause");
    if (runStartedRef.current) {
      setElapsedSec(
        computeElapsedSec(
          runStartedRef.current,
          pausedAccumRef.current,
          pauseStartedRef.current,
        ),
      );
    }
  }, [clearWatch, autoPauseIfIdle, isCurrentSessionOwner]);

  const resume = useCallback((expectedUid: string) => {
    if (!isCurrentSessionOwner(expectedUid) || statusRef.current !== "paused") return;
    const now = Date.now();
    if (pauseStartedRef.current) {
      pausedAccumRef.current += now - pauseStartedRef.current;
      pauseStartedRef.current = null;
    }
    autoPausedRef.current = false;
    // 방치 판정 창도 새로 시작 — 일시정지 직전의 무이동 구간이 재개 직후 발동으로 이어지지 않게.
    idleAnchorRef.current = { timeMs: now, distanceM: distanceAccumRef.current };
    setAutoPaused(false);
    // 치팅 상태 리셋 — 재개 후 새로 측정
    vehicleStateRef.current = resetVehicleState();
    setVehicleTier("normal");
    // 일시정지 동안의 이동(도보·이동수단)을 정지 전 마지막 점과 직선으로 이어
    // 거리에 합산하지 않도록 재정박하고, 속도 추정 기준점도 리셋한다.
    reanchorNextRef.current = true;
    lastRawPosRef.current = null;
    lastPosTimeRef.current = null;
    setStatus("running");
    statusRef.current = "running";
    startWatch();
  }, [isCurrentSessionOwner, startWatch]);

  const stop = useCallback((expectedUid: string): WorkoutFinishSnapshot | null => {
    if (
      !isCurrentSessionOwner(expectedUid)
      || statusRef.current === "idle"
      || runStartedRef.current == null
    ) {
      return null;
    }

    const now = Date.now();
    // 백그라운드에서 JS 타이머가 멈췄다가 종료 버튼과 함께 깨어난 경우도 마지막으로 보정한다 —
    // 방치 창(30분)이 이미 넘어 있으면 종료 시각·활동시간을 앵커 시각으로 소급한다.
    if (statusRef.current === "running" && idleAnchorRef.current != null) {
      const inferred = idleAutoPauseAt(idleAnchorRef.current, now);
      if (inferred != null) {
        pauseStartedRef.current = clampIdlePauseAt(inferred);
        autoPausedRef.current = true;
      }
    }
    const effectiveEndedAt =
      autoPausedRef.current && pauseStartedRef.current != null
        ? pauseStartedRef.current
        : now;
    const endedAt = new Date(effectiveEndedAt).toISOString();
    const startedAt = new Date(runStartedRef.current).toISOString();
    const startedAtLocal = toWallClockIso(runStartedRef.current);
    const finalElapsed = computeElapsedSec(
      runStartedRef.current,
      pausedAccumRef.current,
      pauseStartedRef.current,
      now,
    );

    let finalPath = [...pathRef.current];
    if (finalPath.length === 0 && position) {
      finalPath = [position];
    }
    const finalDistance = Math.round(distanceAccumRef.current);

    const snapshot: WorkoutFinishSnapshot = {
      clientWorkoutId: createClientWorkoutId(),
      startedAt,
      startedAtLocal,
      endedAt,
      durationSec: Math.max(1, finalElapsed),
      distanceM: finalDistance,
      calories: estimateCalories(finalDistance),
      avgPaceSecPerKm: avgPaceSecPerKm(finalDistance, finalElapsed),
      path: finalPath,
    };

    clearWatch();
    clearWorkout(); // 완료 시 저장된 세션 삭제
    restoreAttemptedUidRef.current = expectedUid;
    resetRuntime();

    return snapshot;
  }, [
    clearWatch,
    position,
    clampIdlePauseAt,
    isCurrentSessionOwner,
    resetRuntime,
  ]);

  // Firebase가 로딩 중이거나 세션 소유자가 현재 계정과 달라진 렌더에서는 effect가 워처와
  // 런타임을 정리하기 전이라도 경로·통계·액션 상태를 즉시 숨긴다.
  const sessionVisible =
    !authState.loading
    && authState.currentUid != null
    && (status === "idle" || sessionOwnerUidRef.current === authState.currentUid);
  const visibleStatus = sessionVisible ? status : "idle";
  const visiblePath = sessionVisible ? path : [];
  const visiblePosition = sessionVisible ? position : null;
  const visibleElapsedSec = sessionVisible ? elapsedSec : 0;
  const visibleDistanceM = sessionVisible ? distanceM : 0;

  return {
    status: visibleStatus,
    path: visiblePath,
    position: visiblePosition,
    elapsedSec: visibleElapsedSec,
    distanceM: visibleDistanceM,
    geoError: sessionVisible ? geoError : null,
    vehicleTier: sessionVisible ? vehicleTier : "normal",
    autoPaused: sessionVisible ? autoPaused : false,
    elapsedLabel: formatClock(visibleElapsedSec),
    paceLabel: formatPace(visibleDistanceM, visibleElapsedSec, unit),
    calories: estimateCalories(visibleDistanceM),
    start,
    pause,
    resume,
    stop,
  };
}
