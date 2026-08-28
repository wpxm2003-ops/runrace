"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { usePathname } from "next/navigation";
import { clearLiveProgress, pauseLiveProgress, postLiveProgress } from "@/lib/api/challenges";
import type { LiveRivalGap } from "@/lib/api/types";
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
  geolocationBlockedCode,
  geolocationErrorCode,
  type GeoErrorCode,
  shouldRestartGpsWatch,
  shouldResetIdleAnchorAfterForegroundGap,
  foregroundGapLooksLikeMovement,
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
import { isLatestLiveProgressResponse } from "./liveProgressFreshness";

// ── 퍼시스턴스 ────────────────────────────────────────────────────────────────
const SAVE_INTERVAL_MS = 10_000;
const WARMUP_FIX_BUFFER_SIZE = 6;
const GPS_WATCHDOG_POLL_MS = 5_000;
const GPS_RESTART_DEBOUNCE_MS = 2_000;
/** 공백 원인 확인용 위치 한 점을 기다리는 최대 시간. 그동안 방치 판정을 미룬다. */
const IDLE_GAP_VERIFY_TIMEOUT_MS = 15_000;
/** 실시간 진행률 핑 주기 — 시작·재개 때는 별도로 즉시 전송하고 이후 60초마다 갱신한다. */
const LIVE_PING_INTERVAL_MS = 60_000;

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
  /** 실시간 진행률 핑(인증 필요) 전송용 Firebase User. currentUid와 항상 같은 사용자를 가리킨다. */
  user: User | null;
};

/** 챌린지별 실시간 라이벌 격차 — live-progress 핑 응답을 워크아웃 화면 렌더용으로 펼친 것. */
export type LiveRivalGapEntry = LiveRivalGap & { challengeId: number };

/** 번역 코드이거나(로케일 따라 문구가 바뀜) 번역 대상이 아닌 원문이거나 둘 중 하나다. */
type GeoErrorState = { code: GeoErrorCode } | { text: string };

/** geoMessages를 주입하지 않는 호출자(테스트 등)를 위한 최소 문구. */
const FALLBACK_GEO_MESSAGES: Record<GeoErrorCode, string> = {
  unavailable: "Location (GPS) is not available on this device.",
  insecure: "GPS only works over a secure (HTTPS) connection.",
  permission: "Location permission was denied.",
  timeout: "Timed out getting your location.",
  unknown: "Couldn't get your location.",
};

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
  /** 최근 live-progress 핑 응답 — 챌린지별 라이벌 격차를 펼친 목록. 핑이 없거나 실패하면 이전 값 유지. */
  const [liveRivalGaps, setLiveRivalGaps] = useState<LiveRivalGapEntry[]>([]);
  /** 아직 끝나지 않은 주기 핑 수 — 느린 네트워크에서 핑이 쌓이지 않게 한다. */
  const livePingPendingRef = useRef(0);
  /**
   * 마지막으로 발급한 라이브 요청 순서 토큰. 서버는 더 큰 값만 받아들이므로, 같은 ms에 두 요청이
   * 만들어져도 반드시 증가하도록 직접 단조성을 보장한다.
   */
  const liveSentAtRef = useRef(0);
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

  // ── 퍼시스턴스: 상태 전환(running↔paused) 시 즉시 저장 ────────────────────
  // 경로(path)는 의존성에서 제외한다 — GPS 포인트마다 재저장하면 매번 전체 배열을
  // JSON.stringify 하여 O(n^2)로 커진다. 경로 스냅샷은 아래 주기적 flush(SAVE_INTERVAL_MS)
  // + pagehide/visibilitychange flush가 담당하며, 이 효과는 상태 전환만 즉시 반영한다.
  useEffect(() => {
    const ownerUid = sessionOwnerUidRef.current;
    if (status === "idle" || runStartedRef.current == null || ownerUid == null) return;
    saveWorkout({
      ownerUid,
      clientWorkoutId: clientWorkoutIdRef.current ?? undefined,
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
        clientWorkoutId: clientWorkoutIdRef.current ?? undefined,
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

  // ── 실시간 진행률 핑: 서버에 현재 누적 거리를 보내 참여 중인 레이스의 라이벌과의
  // 실시간 격차를 받는다. 로컬 저장(위 SAVE_INTERVAL_MS)과 달리 서버 호출이라, 탈것 의심/확정
  // 상태나 방치 자동 일시정지 중에는 보내지 않는다(부정확하거나 멈춘 값이 라이벌 격차에 섞이지 않게).
  // best-effort — 실패해도 러닝 자체는 계속되며 이전 격차 값을 그대로 둔다.
  /**
   * 단조 증가하는 요청 순서 토큰. 서버는 더 큰 값만 반영하므로 이 값이 핑·일시정지·삭제의
   * 순서를 정한다 — 네트워크 재정렬과 무관하다. 같은 ms에 두 요청이 나가도 뒤엣것이 크도록
   * 직접 단조성을 보장한다.
   */
  const nextLiveSentAt = useCallback(() => {
    const next = Math.max(Date.now(), liveSentAtRef.current + 1);
    liveSentAtRef.current = next;
    return next;
  }, []);

  // ── 실시간 진행률 핑: 서버에 현재 누적 거리를 보내 참여 중인 레이스의 라이벌과의
  // 실시간 격차를 받는다. 로컬 저장(위 SAVE_INTERVAL_MS)과 달리 서버 호출이라, 탈것 의심/확정
  // 상태나 방치 자동 일시정지 중에는 보내지 않는다(부정확하거나 멈춘 값이 라이벌 격차에 섞이지 않게).
  // best-effort — 실패해도 러닝 자체는 계속되며 이전 격차 값을 그대로 둔다.
  const sendLivePing = useCallback((opts?: { force?: boolean }) => {
    // 주기 핑은 앞선 핑이 안 끝났으면 건너뛴다. 느린 네트워크에서 주기(60초)보다 오래 걸리면
    // 핑이 계속 쌓여 큐가 길어지고, 뒤에 들어올 해제 요청도 그만큼 밀린다.
    // 건너뛰어도 손해가 없다 — 다음 주기에 더 최신 거리로 보낸다.
    //
    // 시작·재개·복귀는 force로 반드시 넣는다. 건너뛰면 앞서 큐에 들어간 일시정지 요청이
    // 뒤에 도착해, 실제로는 달리는 중인데 다음 주기(최대 60초)까지 멈춘 것으로 보인다 —
    // 큐의 마지막이 항상 사용자의 현재 의도여야 한다. 서버 판정과는 무관한 클라이언트 개념이다.
    if (!opts?.force && livePingPendingRef.current > 0) return;
    livePingPendingRef.current++;
    void (async () => {
      // 가드·페이로드는 큐에서 실제로 실행되는 시점에 읽는다(대기 중 상태가 바뀔 수 있다).
      const ownerUid = sessionOwnerUidRef.current;
      const clientWorkoutId = clientWorkoutIdRef.current;
      const user = authUserRef.current;
      if (
        statusRef.current !== "running"
        || ownerUid == null
        || clientWorkoutId == null
        || user == null
        || user.uid !== ownerUid
        || vehicleStateRef.current.tier !== "normal"
        || autoPausedRef.current
      ) {
        return Promise.resolve();
      }
      // 경과 시간을 함께 보내 서버가 첫 핑부터 평균 속도를 검증할 수 있게 한다
      // (이전 핑과의 델타만으로는 비교 대상이 없는 첫 핑을 걸러내지 못한다).
      //
      // 최소 1초로 올린다. 시작 직후 핑은 경과가 0초라 그대로 보내면 서버가 duration_invalid로
      // 거절하고(그래서 예전에는 여기서 조기 반환했다), 그러면 시작 핑이 통째로 버려져
      // 최대 60초 동안 남들 화면에 안 보인다. 거리 0에 1초면 속도 0이라 검증에도 안전하고,
      // 분모를 줄이는 방향이라 조작에 유리해지지도 않는다.
      const elapsedSec = Math.max(
        1,
        computeElapsedSec(
          runStartedRef.current ?? Date.now(),
          pausedAccumRef.current,
          pauseStartedRef.current,
        ),
      );
      const sentAt = nextLiveSentAt();
      return await postLiveProgress(
        Math.round(distanceAccumRef.current),
        elapsedSec,
        sentAt,
        clientWorkoutId,
        user,
      ).then(
        (res) => {
          // 응답 도착 시점에도 여전히 같은 소유자의 같은 런이 진행 중일 때만 반영 —
          // 그 사이 런이 끝나거나 계정이 바뀌었으면 낡은 격차를 화면에 남기지 않는다.
          if (
            sessionOwnerUidRef.current !== ownerUid
            || statusRef.current !== "running"
            || !isLatestLiveProgressResponse(
              clientWorkoutId,
              sentAt,
              clientWorkoutIdRef.current,
              liveSentAtRef.current,
            )
          ) return;
          setLiveRivalGaps(
            res.challenges.flatMap((c) =>
              c.rivalGaps.map((g) => ({ ...g, challengeId: c.challengeId })),
            ),
          );
        },
      );
    })().catch(() => {}).finally(() => {
      livePingPendingRef.current--;
    });
  }, [nextLiveSentAt]);

  /**
   * "지금 뛰고 있지 않다"를 서버에 알린다 — 거리는 남기고 "러닝 중" 표시만 끈다.
   * 앞선 핑 뒤에 실행되도록 같은 큐에 넣는다(먼저 보내면 늦게 도착한 핑이 되살린다).
   * best-effort — 실패해도 신선도 윈도가 지나면 어차피 사라진다.
   *
   * <p>일시정지·종료 모두 이걸 쓴다. 종료에도 삭제를 쓰지 않는 이유: 이 시점엔 확정 저장이
   * 아직 안 끝났다. 먼저 지우면 total_km이 오르기 전까지 진행바가 이번 런 이전 값으로
   * 뒷걸음질 치고, 저장이 실패해 보류되면 그 상태가 오래 간다(결승 직전에 0으로 떨어져 보인다).
   * 저장이 성공하면 서버의 확정 경로가 리셋하고, 실패하면 신선도 윈도가 정리한다.
   */
  const pauseLiveRun = useCallback((expectedUid: string) => {
    const user = authUserRef.current;
    if (user == null || user.uid !== expectedUid) return;
    // 큐에 넣지 않고 바로 보낸다. 순서는 토큰이 보장하므로(서버가 더 큰 값만 반영) 줄을
    // 세울 이유가 없고, 세우면 응답 없는 핑 뒤에 멈춤 신호가 갇혀 "러닝 중"이 남는다.
    void pauseLiveProgress(user, nextLiveSentAt()).catch(() => {});
  }, [nextLiveSentAt]);

  /**
   * 이번 런을 저장하지 않기로 확정됐을 때 라이브 값을 통째로 지운다(1m 미만 저장 취소, 경로 없음).
   * 일시정지로 남겨 두면 저장되지도 않을 거리가 신선도 윈도(15분) 동안 남아 있다가 뒤늦게
   * 떨어진다 — 종료 경로가 일시정지를 쓰는 이유(확정 저장이 곧 따라온다)가 여기엔 없다.
   */
  const discardLiveRun = useCallback((expectedUid: string) => {
    const user = authUserRef.current;
    if (user == null || user.uid !== expectedUid) return;
    setLiveRivalGaps([]);
    void clearLiveProgress(user, nextLiveSentAt()).catch(() => {});
  }, [nextLiveSentAt]);

  // 러닝 중일 때만 타이머를 건다. 상시 등록하면 운동하지 않는 동안에도 60초마다 콜백이
  // 깨어난다(요청은 가드가 막지만 깨우는 것 자체가 낭비다). 재개 시 위상이 처음부터 다시
  // 시작되는데, 재개는 어차피 force 핑을 따로 보내므로 공백이 생기지 않는다.
  useEffect(() => {
    if (status !== "running") return;
    const timer = setInterval(sendLivePing, LIVE_PING_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [status, sendLivePing]);

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
    clientWorkoutIdRef.current = null;
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
    setGeoErrorState(null);
    setVehicleTier("normal");
    setAutoPaused(false);
    setLiveRivalGaps([]);
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
        computeElapsedSec(runStartedRef.current, pausedAccumRef.current, pausedAt),
      );
    }
    void track("running_auto_pause");
    return true;
  }, [clearWatch, clampIdlePauseAt, isCurrentSessionOwner, pauseLiveRun]);

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
      setGeoErrorState(null);
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

      const previousTier = vehicleStateRef.current.tier;
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
      // 탈것 판정이 걸리면 핑이 멈춘다. 그 사실을 서버에 알리지 않으면 마지막 값이 신선한
      // 동안(15분) 계속 "러닝 중"으로 보이고, 그 뒤 만료되면서 거리까지 한 번에 뒤로 내려앉는다
      // — 일시정지 표시를 만든 이유와 같은 현상이다. 판정에 들어가는 순간 한 번만 알린다.
      if (previousTier === "normal" && vehicle.tier !== "normal") {
        const ownerUid = sessionOwnerUidRef.current;
        if (ownerUid != null) pauseLiveRun(ownerUid);
      } else if (previousTier !== "normal" && vehicle.tier === "normal") {
        // 판정이 풀리면 즉시 복귀를 알린다. 주기 핑은 다음 틱(최대 60초)까지 안 나가고,
        // 그동안 실제로 달리는 사람이 계속 "멈춘 사람"으로 표시된다. 재개와 같은 전이다.
        sendLivePing({ force: true });
      }
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
    [peekSpeedMps, commitRawPosition, autoPauseIfIdle, isCurrentSessionOwner, pauseLiveRun,
     sendLivePing],
  );

  const startWatch = useCallback(() => {
    const watchOwnerUid = sessionOwnerUidRef.current;
    if (watchOwnerUid == null || !isCurrentSessionOwner(watchOwnerUid)) return;
    const blocked = geolocationBlockedCode();
    if (blocked) {
      setGeoErrorState({ code: blocked });
      return;
    }
    setGeoErrorState(null);
    clearWatch();
    watchStartedAtRef.current = Date.now();
    const seq = watchSeqRef.current;
    const isLiveWatch = () =>
      watchSeqRef.current === seq
      && statusRef.current === "running"
      && isCurrentSessionOwner(watchOwnerUid);
    // 네이티브 권한 순차 요청(FcmBootstrap)이 끝나기 전에는 addWatcher를 부르지 않는다.
    // 플러그인의 addWatcher는 권한이 없어도 조기 반환하지 않고 알림을 만들어
    // startForeground까지 진행한다. targetSdk 34+에서 type=location 포그라운드 서비스는
    // 호출 시점에 위치 권한이 있어야 하므로, 권한 다이얼로그가 떠 있는 동안 호출되면
    // SecurityException이 나고 플러그인이 그걸 삼킨 뒤 다시는 승격을 시도하지 않는다
    // (onPermissionsGranted는 requestLocationUpdates만 재등록한다).
    // 이 게이트는 첫 실행에서만 실제로 대기하고, 그 뒤로는 즉시 통과한다.
    void waitForNativePermissions().then(() => {
      if (!isLiveWatch()) return;
      return startBackgroundWatch(
        (coords) => {
          if (!isLiveWatch()) return;
          setGeoErrorState(null);
          appendPosition(coords);
        },
        (msg) => {
          if (isLiveWatch()) setGeoErrorState({ text: msg });
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
            setGeoErrorState({ text: e instanceof Error ? e.message : String(e) });
          }
        });
    });
  }, [
    appendPosition,
    clearWatch,
    isCurrentSessionOwner,
    bgNotification?.title,
    bgNotification?.message,
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
      // 라이브 값은 여기서 정리하지 않는다. 러닝 중 로그아웃·계정 삭제는 UI에서 이미 막혀
      // 있어(SiteHeader·설정 화면의 "운동을 종료한 뒤" 안내) 이 경로로 오는 건 토큰 만료·
      // 서버측 취소 같은 예외뿐인데, 그때는 이전 소유자 토큰이 이미 무효라 요청 자체가
      // 나가지 않는다. 거의 실패할 정리 코드를 두면 "인증이 바뀌어도 정리된다"는 잘못된
      // 기대만 남으므로, 그 예외는 신선도 윈도(15분) 만료에 맡긴다.
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
    // 구버전 저장본에는 런 ID가 없다. 복원 시 한 번 발급하고 이후 주기 저장에서 보존한다.
    clientWorkoutIdRef.current = saved.clientWorkoutId ?? createClientWorkoutId();

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
        // 여기서 곧바로 워처를 건다. 예전에는 ref 플래그를 세우고 별도 이펙트가 그것을
        // 읽어 startWatch를 부르게 했는데, 그 이펙트의 의존성이 [startWatch] 하나뿐이고
        // startWatch의 의존성 체인이 전부 상수라 identity가 고정된다 — 즉 마운트 때 딱 한
        // 번(플래그가 아직 false일 때) 돌고, 인증이 해소돼 플래그가 켜져도 다시 돌지 않았다.
        // 콜드스타트에서는 항상 그 순서라, 복원된 러닝의 GPS가 워치독이 구제할 때까지
        // 붙지 않았다. statusRef는 위에서 이미 갱신했으므로 동기 호출로 안전하다.
        startWatch();
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
    startWatch,
  ]);

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
      const blocked = geolocationBlockedCode();
      if (blocked) {
        setGeoErrorState({ code: blocked });
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
          setGeoErrorState(null);
        },
        (err) => {
          if (
            !cancelled
            && currentUidRef.current === warmupUid
            && statusRef.current === "idle"
          ) {
            setGeoErrorState({ code: geolocationErrorCode(err) });
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
  /**
   * 런을 시작한다. 실제로 시작됐는지 반환한다 — 인증 미확정·이미 진행 중·GPS 차단이면
   * 조기 반환하므로, 호출부가 이 값을 보지 않으면 시작되지도 않은 런의 활동 이력이 남는다.
   */
  const start = useCallback((expectedUid: string): boolean => {
    if (
      authLoadingRef.current
      || expectedUid !== currentUidRef.current
      || currentUidRef.current == null
      || statusRef.current !== "idle"
    ) {
      return false;
    }
    const blocked = geolocationBlockedCode();
    if (blocked) {
      setGeoErrorState({ code: blocked });
      return false;
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
    // 시작 즉시 한 번 보낸다. 주기 타이머는 마운트 시점에 걸려 런 시작과 위상이 맞지 않아,
    // 이게 없으면 최대 60초 동안 남들 화면에 아무 변화가 없고 60초 미만 런은 아예 반영되지
    // 않는다(그런데 종료 신호는 나가서 비대칭이 된다). 재개와 같은 이유다.
    sendLivePing({ force: true });
    // 같은 계정에서 직전 런을 끝내고 곧바로 새 런을 시작해도, 직전 getCurrentPosition
    // 콜백이 새 런의 첫 좌표로 들어오지 않도록 워처 세대를 함께 고정한다.
    const seedWatchSeq = watchSeqRef.current;
    void track("running_start");

    if (startSeed) return true;

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
          setGeoErrorState({ code: geolocationErrorCode(err) });
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: WORKOUT_START_FIX_MAX_AGE_MS,
        timeout: 15_000,
      },
    );
    return true;
  }, [isCurrentSessionOwner, startWatch, sendLivePing]);

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
    // 일시정지 = 지금 뛰고 있지 않다. 라이브 값을 남겨 두면 신선도 윈도(15분) 동안
    // 남들에게 "러닝 중"으로 계속 보인다. 재개하면 아래에서 곧바로 다시 올린다.
    pauseLiveRun(expectedUid);
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
  }, [clearWatch, autoPauseIfIdle, isCurrentSessionOwner, pauseLiveRun]);

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
    // 일시정지 표시를 다음 주기(60초)까지 기다리지 않고 곧바로 푼다. force가 필수다 —
    // 느린 핑이 아직 큐에 남아 있으면 일반 핑은 건너뛰어지고, 그러면 앞서 넣은 일시정지
    // 요청이 마지막 의도로 남아 실제로는 달리는 중인데 계속 멈춘 것으로 보인다.
    sendLivePing({ force: true });
  }, [isCurrentSessionOwner, startWatch, sendLivePing]);

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
      clientWorkoutId: clientWorkoutIdRef.current ?? createClientWorkoutId(),
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
    // 라이브(잠정) 진행률 즉시 해제 — 저장이 성공하면 서버가 어차피 리셋하지만, 저장에
    // 실패하거나 기록을 버리면 아무도 지우지 않아 "러닝 중" 표시와 부풀려진 진행바가
    // 신선도 윈도(15분) 동안 남는다. best-effort — 실패해도 종료 자체는 진행한다.
    setLiveRivalGaps([]);
    pauseLiveRun(expectedUid);
    // 이 런의 스냅샷일 때만 지운다 — 웹에서 다른 탭이 진행 중이면 그쪽을 날리지 않는다.
    clearWorkout(runStartedRef.current ?? undefined);
    restoreAttemptedUidRef.current = expectedUid;
    resetRuntime();

    return snapshot;
  }, [
    clearWatch,
    position,
    clampIdlePauseAt,
    pauseLiveRun,
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
  // ref가 아니라 prop을 읽는다 — 로케일이 바뀌면 이미 떠 있는 배너도 함께 바뀌어야 한다.
  const geoErrorMessage = geoErrorState == null
    ? null
    : "code" in geoErrorState
      ? (geoMessages?.[geoErrorState.code] ?? FALLBACK_GEO_MESSAGES[geoErrorState.code])
      : geoErrorState.text;

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
