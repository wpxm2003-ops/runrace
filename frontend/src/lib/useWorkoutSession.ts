"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { usePathname } from "next/navigation";
import {
  estimateCalories,
  formatClock,
  idleAutoPauseAt,
  type IdleAnchor,
  type LatLng,
  type VehicleDetectState,
  type VehicleTier,
  geolocationBlockedCode,
  type GeoErrorCode,
  shouldResetIdleAnchorAfterForegroundGap,
  foregroundGapLooksLikeMovement,
  type WorkoutStatus,
} from "./workoutTrack";
import {
  computeWorkoutElapsedSec,
  initialVehicleDetectState,
} from "./workoutSessionMath";
import { useWorkoutPersistenceFlush } from "./useWorkoutPersistenceFlush";
import { useUnit } from "./UnitContext";
import { formatPace } from "./units";
import { track } from "./analytics";
import { useWorkoutLiveProgress } from "./useWorkoutLiveProgress";
import {
  useWorkoutGpsWarmup,
  type GeoErrorState,
} from "./useWorkoutGpsWarmup";
import { isWorkoutSessionVisible, resolveWorkoutGeoError } from "./workoutSessionPresentation";
import { useWorkoutRuntimeEffects } from "./useWorkoutRuntimeEffects";
import { useWorkoutSessionRestore } from "./useWorkoutSessionRestore";
import { clearWorkoutWatch, resetWorkoutRuntimeRefs } from "./workoutSessionRuntime";
import { startWorkoutGpsWatch } from "./workoutGpsWatch";
import { createWorkoutPositionTracker } from "./useWorkoutPositionTracking";
import { useWorkoutSessionControls } from "./useWorkoutSessionControls";

// ── 퍼시스턴스 ────────────────────────────────────────────────────────────────
const GPS_RESTART_DEBOUNCE_MS = 2_000;
/** 공백 원인 확인용 위치 한 점을 기다리는 최대 시간. 그동안 방치 판정을 미룬다. */
const IDLE_GAP_VERIFY_TIMEOUT_MS = 15_000;

type WorkoutSessionAuth = {
  /** Firebase가 확정한 현재 사용자 UID. hint 같은 낙관값은 사용하지 않는다. */
  currentUid: string | null;
  loading: boolean;
  /** 실시간 진행률 핑(인증 필요) 전송용 Firebase User. currentUid와 항상 같은 사용자를 가리킨다. */
  user: User | null;
};

export type { LiveRivalGapEntry } from "./useWorkoutLiveProgress";

// ── 메인 훅 ───────────────────────────────────────────────────────────────────
export function useWorkoutSession(
  bgNotification: { title: string; message: string } | undefined,
  authState: WorkoutSessionAuth,
  geoMessages?: Record<GeoErrorCode, string>,
) {
  const { unit } = useUnit();
  const pathname = usePathname();
  const currentUidRef = useRef(authState.currentUid);
  const authLoadingRef = useRef(authState.loading);
  const authUserRef = useRef(authState.user);
  // 인증 변경과 같은 렌더 안에서 GPS 콜백·액션 가드가 즉시 새 UID를 보게 한다.
  currentUidRef.current = authState.currentUid;
  authLoadingRef.current = authState.loading;
  authUserRef.current = authState.user;
  // ── 기본 상태 ─────────────────────────────────────────────────────────────
  const [status, setStatus] = useState<WorkoutStatus>("idle");
  const [path, setPath] = useState<LatLng[]>([]);
  const [position, setPosition] = useState<LatLng | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [distanceM, setDistanceM] = useState(0);
  /**
   * 로케일이 바뀌면 문구도 따라 바뀌어야 하므로 완성된 문자열이 아니라 코드를 담는다.
   * 예전에는 번역된 문자열을 넣어, 언어를 바꿔도 이미 떠 있는 배너만 이전 언어로 남았다.
   * 네이티브 플러그인이 던진 메시지처럼 번역 대상이 아닌 것만 text로 담는다.
   */
  const [geoErrorState, setGeoErrorState] = useState<GeoErrorState | null>(null);
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
  /** 시작부터 라이브 핑·최종 저장까지 유지하는 런 식별자. */
  const clientWorkoutIdRef = useRef<string | null>(null);
  const autoPausedRef = useRef(false);
  /** 시작 시 고정한 Firebase UID. 현재 인증 UID와 다르면 모든 액션·GPS 반영을 차단한다. */
  const sessionOwnerUidRef = useRef<string | null>(null);
  const restoreAttemptedUidRef = useRef<string | null>(null);
  /** 방치 자동 일시정지 기준점 — 마지막으로 충분한 전진(100m)이 확인된 시각·누적 거리. */
  const idleAnchorRef = useRef<IdleAnchor | null>(null);
  /** 공백 원인을 확인하는 동안 방치 판정을 미루는 시한(epoch ms). 0이면 미루지 않는다. */
  const idleCheckDeferredUntilRef = useRef(0);
  /** 확인 요청 세대 — 늦게 도착한 응답이 최신 판단을 덮어쓰지 않게 한다. */
  const gapVerifySeqRef = useRef(0);
  // ── 탈것 Tiered 감지 레프 ─────────────────────────────────────────────────
  const vehicleStateRef = useRef<VehicleDetectState>(initialVehicleDetectState());
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

  useWorkoutPersistenceFlush(status, autoPaused, {
    sessionOwnerUidRef,
    clientWorkoutIdRef,
    statusRef,
    pathRef,
    distanceAccumRef,
    runStartedRef,
    pausedAccumRef,
    pauseStartedRef,
    idleAnchorRef,
    autoPausedRef,
  });

  const liveProgressRefs = useMemo(() => ({
    authUserRef,
    statusRef,
    sessionOwnerUidRef,
    clientWorkoutIdRef,
    vehicleStateRef,
    autoPausedRef,
    runStartedRef,
    pausedAccumRef,
    pauseStartedRef,
    distanceAccumRef,
  }), []);
  const {
    liveRivalGaps,
    sendLivePing,
    pauseLiveRun,
    discardLiveRun,
    clearLiveRivalGaps,
  } = useWorkoutLiveProgress(status, liveProgressRefs);

  const warmupFixesRef = useWorkoutGpsWarmup({
    authLoading: authState.loading,
    currentUid: authState.currentUid,
    status,
    pathname,
    currentUidRef,
    statusRef,
    setPosition,
    setGeoErrorState,
  });

  // ── GPS 유틸 ──────────────────────────────────────────────────────────────
  /**
   * 워처 등록 세대 토큰. 네이티브 addWatcher는 비동기(권한 다이얼로그로 수초 걸릴 수 있음)라,
   * 등록이 끝나기 전에 pause/stop/재시작이 오면 clearWatch가 멈출 대상이 아직 없다.
   * 그대로 두면 낡은 워처가 등록 완료 후 영영 살아남는다(배터리·상시 알림 누수).
   * clearWatch가 세대를 올리고, 등록 완료 시 세대가 달라져 있으면 즉시 자기를 해제한다.
   */
  const watchSeqRef = useRef(0);
  const clearWatch = useCallback(() => {
    clearWorkoutWatch({
      watchSeq: watchSeqRef,
      watchStartedAt: watchStartedAtRef,
      stopWatch: stopWatchRef,
    });
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
    resetWorkoutRuntimeRefs({
      status: statusRef, path: pathRef, sessionOwnerUid: sessionOwnerUidRef,
      clientWorkoutId: clientWorkoutIdRef, pauseStarted: pauseStartedRef,
      pausedAccum: pausedAccumRef, runStarted: runStartedRef, autoPaused: autoPausedRef,
      idleAnchor: idleAnchorRef, warmupFixes: warmupFixesRef,
      vehicleState: vehicleStateRef, distanceAccum: distanceAccumRef,
      lastPathPoint: lastPathPointRef, lastAppendWallMs: lastAppendWallMsRef,
      lastRawPos: lastRawPosRef, lastPosTime: lastPosTimeRef,
      watchStartedAt: watchStartedAtRef, lastGpsFixAt: lastGpsFixAtRef,
      lastWatchRestartAt: lastWatchRestartAtRef, reanchorNext: reanchorNextRef,
    });

    setStatus("idle");
    setPath([]);
    setPosition(null);
    setDistanceM(0);
    setElapsedSec(0);
    setGeoErrorState(null);
    setVehicleTier("normal");
    setAutoPaused(false);
    clearLiveRivalGaps();
  }, [clearLiveRivalGaps, warmupFixesRef]);

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
    // 포그라운드 복귀 직후 공백 원인을 확인하는 중이면 판정을 미룬다 — 확인해 보기도 전에
    // 1초 타이머가 먼저 돌아 실제 러닝을 잘라내는 것을 막는다.
    if (nowMs < idleCheckDeferredUntilRef.current) return false;
    const rawPausedAt = idleAutoPauseAt(idleAnchorRef.current, nowMs);
    if (rawPausedAt == null) return false;
    const pausedAt = clampIdlePauseAt(rawPausedAt);

    pauseStartedRef.current = pausedAt;
    autoPausedRef.current = true;
    setAutoPaused(true);
    setStatus("paused");
    statusRef.current = "paused";
    clearWatch();
    // 방치 자동 일시정지 = 종료를 잊은 채 30분 넘게 안 움직인 상태. 라이브 값을 그대로 두면
    // 이 사람이 계속 "러닝 중"으로 보인다 — 가장 오래 남는 경우라 여기서 반드시 해제한다.
    const ownerUid = sessionOwnerUidRef.current;
    if (ownerUid != null) pauseLiveRun(ownerUid);
    if (runStartedRef.current != null) {
      setElapsedSec(
        computeWorkoutElapsedSec(runStartedRef.current, pausedAccumRef.current, pausedAt),
      );
    }
    void track("running_auto_pause");
    return true;
  }, [clearWatch, clampIdlePauseAt, isCurrentSessionOwner, pauseLiveRun]);

  const positionRuntime = useMemo(() => ({
    status: statusRef,
    sessionOwnerUid: sessionOwnerUidRef,
    vehicleState: vehicleStateRef,
    lastRawPosition: lastRawPosRef,
    lastPositionTime: lastPosTimeRef,
    lastPathPoint: lastPathPointRef,
    lastAppendWallMs: lastAppendWallMsRef,
    lastGpsFixAt: lastGpsFixAtRef,
    distanceAccum: distanceAccumRef,
    runStarted: runStartedRef,
    pausedAccum: pausedAccumRef,
    idleAnchor: idleAnchorRef,
    reanchorNext: reanchorNextRef,
  }), []);
  const appendPosition = useMemo(() => createWorkoutPositionTracker({
      runtime: positionRuntime,
      isCurrentSessionOwner,
      autoPauseIfIdle,
      pauseLiveRun,
      sendLivePing,
      setGeoErrorState,
      setPosition,
      setVehicleTier,
      setPath,
      setDistanceM,
    }), [
      autoPauseIfIdle,
      isCurrentSessionOwner,
      pauseLiveRun,
      positionRuntime,
      sendLivePing,
    ]);

  // Provider는 매 렌더마다 새 객체를 넘긴다. 값이 같으면 감시 타이머의 콜백도 유지한다.
  const notificationTitle = bgNotification?.title;
  const notificationMessage = bgNotification?.message;
  const startWatch = useCallback(() => {
    const watchOwnerUid = sessionOwnerUidRef.current;
    if (watchOwnerUid == null || !isCurrentSessionOwner(watchOwnerUid)) return;
    const blocked = geolocationBlockedCode();
    if (blocked) {
      setGeoErrorState({ code: blocked });
      return;
    }
    startWorkoutGpsWatch({
      ownerUid: watchOwnerUid,
      watchSequence: watchSeqRef,
      status: statusRef,
      stopWatch: stopWatchRef,
      watchStartedAt: watchStartedAtRef,
      isCurrentSessionOwner,
      clearWatch,
      appendPosition,
      setGeoErrorState,
      notification: notificationTitle != null && notificationMessage != null
        ? { title: notificationTitle, message: notificationMessage }
        : undefined,
    });
  }, [
    appendPosition,
    clearWatch,
    isCurrentSessionOwner,
    notificationTitle,
    notificationMessage,
  ]);

  const resetIdleAnchor = useCallback((nowMs: number) => {
    if (statusRef.current !== "running") return;
    idleAnchorRef.current = { timeMs: nowMs, distanceM: distanceAccumRef.current };
  }, []);

  /**
   * 포그라운드 복귀로 드러난 긴 공백이 실제 이동이었는지 위치 한 점으로 확인한다.
   *
   * <p>결과가 올 때까지 방치 판정을 미룬다 — 1초 타이머가 먼저 돌면 확인해 보기도 전에
   * 자동 일시정지가 걸려버린다. 위치를 못 얻으면 이동한 것으로 보고 리셋한다(진짜 러닝을
   * 자르는 실패가 더 나쁘다). 늦게 도착한 응답은 세대 토큰으로 버린다.
   */
  const verifyForegroundGap = useCallback((anchor: IdleAnchor) => {
    const reference = anchor.position ?? lastPathPointRef.current;
    if (
      reference == null
      || typeof navigator === "undefined"
      || !navigator.geolocation
    ) {
      resetIdleAnchor(Date.now());
      return;
    }
    const seq = ++gapVerifySeqRef.current;
    idleCheckDeferredUntilRef.current = Date.now() + IDLE_GAP_VERIFY_TIMEOUT_MS;

    const settle = (moved: boolean) => {
      if (seq !== gapVerifySeqRef.current) return;
      idleCheckDeferredUntilRef.current = 0;
      if (moved) resetIdleAnchor(Date.now());
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => settle(foregroundGapLooksLikeMovement(reference, {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      })),
      () => settle(true),
      { enableHighAccuracy: false, maximumAge: 0, timeout: IDLE_GAP_VERIFY_TIMEOUT_MS },
    );
  }, [resetIdleAnchor]);

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
      const anchor = idleAnchorRef.current;
      // 앵커가 아직 방치 판정에 못 미치면 리셋해도 잃는 게 없다 — 위치 확인 없이 즉시 간다.
      // 이미 판정선을 넘긴 경우에만, 그 공백이 실제 이동이었는지 확인하고 결정한다.
      // 무조건 리셋하면 30분+ 쉬었다 돌아온 세션이 방치 판정을 통째로 건너뛰어
      // 쉰 시간이 운동 시간·페이스에 섞였다.
      if (anchor == null || idleAutoPauseAt(anchor, now) == null) {
        resetIdleAnchor(now);
      } else {
        verifyForegroundGap(anchor);
      }
    }
    // Never join the last pre-suspension point to the first recovered fix.
    reanchorNextRef.current = true;
    lastRawPosRef.current = null;
    lastPosTimeRef.current = null;
    startWatch();
    // 백그라운드에서 WebView가 잠들면 주기 타이머도 함께 멈춘다(이 함수의 존재 이유이기도
    // 하다). 신선도 윈도를 넘겼으면 서버는 이미 이 사람을 "안 뛰는 사람"으로 보고 있고,
    // 복귀 후 다음 틱까지 기다리면 최대 60초를 더 그대로 둔다. 재개와 같은 전이로 취급한다.
    sendLivePing({ force: true });
    void track("running_gps_watch_restart", { reason });
  }, [isCurrentSessionOwner, startWatch, resetIdleAnchor, verifyForegroundGap, sendLivePing]);

  useWorkoutRuntimeEffects({
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
  });

  useWorkoutSessionRestore({
    currentUid: authState.currentUid,
    authLoading: authState.loading,
    statusRef,
    runStartedRef,
    idleAnchorRef,
    pauseStartedRef,
    autoPausedRef,
    clientWorkoutIdRef,
    pathRef,
    distanceAccumRef,
    pausedAccumRef,
    sessionOwnerUidRef,
    restoreAttemptedUidRef,
    lastPathPointRef,
    reanchorNextRef,
    lastAppendWallMsRef,
    clampIdlePauseAt,
    clearWatch,
    resetRuntime,
    startWatch,
    setPath,
    setPosition,
    setDistanceM,
    setAutoPaused,
    setElapsedSec,
    setStatus,
  });

  const { start, pause, resume, stop } = useWorkoutSessionControls({
    authLoadingRef,
    currentUidRef,
    statusRef,
    sessionOwnerUidRef,
    clientWorkoutIdRef,
    restoreAttemptedUidRef,
    warmupFixesRef,
    pathRef,
    distanceAccumRef,
    lastPathPointRef,
    lastAppendWallMsRef,
    reanchorNextRef,
    vehicleStateRef,
    pausedAccumRef,
    pauseStartedRef,
    runStartedRef,
    autoPausedRef,
    idleAnchorRef,
    lastRawPosRef,
    lastPosTimeRef,
    watchSeqRef,
    currentPosition: position,
    isCurrentSessionOwner,
    autoPauseIfIdle,
    clampIdlePauseAt,
    startWatch,
    clearWatch,
    sendLivePing,
    pauseLiveRun,
    clearLiveRivalGaps,
    resetRuntime,
    setPath,
    setPosition,
    setDistanceM,
    setElapsedSec,
    setVehicleTier,
    setAutoPaused,
    setStatus,
    setGeoErrorState,
  });

  // Firebase가 로딩 중이거나 세션 소유자가 현재 계정과 달라진 렌더에서는 effect가 워처와
  // 런타임을 정리하기 전이라도 경로·통계·액션 상태를 즉시 숨긴다.
  const sessionVisible = isWorkoutSessionVisible(
    authState.loading,
    authState.currentUid,
    status,
    sessionOwnerUidRef.current,
  );
  const visibleStatus = sessionVisible ? status : "idle";
  const visiblePath = sessionVisible ? path : [];
  const visiblePosition = sessionVisible ? position : null;
  const visibleElapsedSec = sessionVisible ? elapsedSec : 0;
  const visibleDistanceM = sessionVisible ? distanceM : 0;
  // ref가 아니라 prop을 읽는다 — 로케일이 바뀌면 이미 떠 있는 배너도 함께 바뀌어야 한다.
  const geoErrorMessage = resolveWorkoutGeoError(geoErrorState, geoMessages);

  return {
    status: visibleStatus,
    path: visiblePath,
    position: visiblePosition,
    elapsedSec: visibleElapsedSec,
    distanceM: visibleDistanceM,
    geoError: sessionVisible ? geoErrorMessage : null,
    vehicleTier: sessionVisible ? vehicleTier : "normal",
    autoPaused: sessionVisible ? autoPaused : false,
    liveRivalGaps: sessionVisible ? liveRivalGaps : [],
    elapsedLabel: formatClock(visibleElapsedSec),
    paceLabel: formatPace(visibleDistanceM, visibleElapsedSec, unit),
    calories: estimateCalories(visibleDistanceM),
    start,
    pause,
    resume,
    stop,
    discardLiveRun,
  };
}
