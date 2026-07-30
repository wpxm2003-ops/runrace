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
  type WorkoutFinishSnapshot,
  type WorkoutStatus,
} from "./workoutTrack";
import { saveWorkout, loadWorkout, clearWorkout } from "./workoutPersistence";
import { useUnit } from "./UnitContext";
import { formatPace } from "./units";
import { startBackgroundWatch, type GeoCoords } from "./backgroundGeo";
import { track } from "./analytics";
import { Capacitor } from "@capacitor/core";
import { waitForNativePermissions } from "./nativePermissions";
import { createClientWorkoutId } from "./workoutRequestId";

// ── 퍼시스턴스 ────────────────────────────────────────────────────────────────
const SAVE_INTERVAL_MS = 10_000;

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

// ── 메인 훅 ───────────────────────────────────────────────────────────────────
export function useWorkoutSession(bgNotification?: { title: string; message: string }) {
  const { unit } = useUnit();
  const pathname = usePathname();
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
  const statusRef = useRef(status);
  const pathRef = useRef(path);
  const pausedAccumRef = useRef(0);
  const pauseStartedRef = useRef<number | null>(null);
  const runStartedRef = useRef<number | null>(null);
  const autoPausedRef = useRef(false);
  /** 방치 자동 일시정지 기준점 — 마지막으로 충분한 전진(100m)이 확인된 시각·누적 거리. */
  const idleAnchorRef = useRef<IdleAnchor | null>(null);

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
    if (status === "idle" || runStartedRef.current == null) return;
    saveWorkout({
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
      if (statusRef.current === "idle" || runStartedRef.current == null) return;
      saveWorkout({
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
    if (stopWatchRef.current) {
      stopWatchRef.current();
      stopWatchRef.current = null;
    }
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
    if (statusRef.current !== "running" || idleAnchorRef.current == null) return false;
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
  }, [clearWatch, clampIdlePauseAt]);

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
      const altitude =
        coords.altitude != null && Number.isFinite(coords.altitude)
          ? coords.altitude
          : undefined;
      const point: LatLng = {
        lat: coords.latitude,
        lng: coords.longitude,
        ...(altitude != null ? { ele: altitude } : {}),
      };
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
      const pointWithT: LatLng = elapsedMs != null ? { ...point, t: elapsedMs } : point;

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
      // 인정 거리가 100m 쌓일 때마다 방치 판정 창을 새로 시작한다. 차단(blockDistance)
      // 중에는 거리가 안 쌓여 앵커가 안 밀리므로, 탑승 상태가 이어지면 창이 차오른다.
      if (idleAnchorRef.current != null) {
        idleAnchorRef.current = slideIdleAnchor(
          idleAnchorRef.current, now, distanceAccumRef.current);
      }
      setPath((prev) => [...prev, pointWithT]);
      setDistanceM(distanceAccumRef.current);
    },
    [peekSpeedMps, commitRawPosition, autoPauseIfIdle],
  );

  const startWatch = useCallback(() => {
    const blocked = geolocationBlockedReason();
    if (blocked) {
      setGeoError(blocked);
      return;
    }
    setGeoError(null);
    clearWatch();
    const seq = watchSeqRef.current;
    startBackgroundWatch(
      (coords) => {
        setGeoError(null);
        appendPosition(coords);
      },
      (msg) => setGeoError(msg),
      bgNotification?.title ?? "운동 기록 중",
      bgNotification?.message ?? "RunRace가 백그라운드에서 경로를 기록하고 있습니다.",
    )
      .then((stop) => {
        // 등록되는 사이 pause/stop/재시작이 있었으면 이 워처는 낡은 것 — 즉시 해제(누수 방지).
        if (watchSeqRef.current !== seq) {
          stop();
          return;
        }
        stopWatchRef.current = stop;
      })
      .catch((e: unknown) => {
        // addWatcher 자체가 실패(플러그인 초기화·권한 거부 reject)하면 기록이 조용히
        // 시작되지 않는다 — 배너로 드러내 사용자가 알 수 있게 한다.
        if (watchSeqRef.current === seq) {
          setGeoError(e instanceof Error ? e.message : String(e));
        }
      });
  }, [appendPosition, clearWatch, bgNotification?.title, bgNotification?.message]);

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

  // ── 마운트 시 세션 복원 (탭 이탈 ≠ 일시정지, running이면 GPS 재개) ───────
  useEffect(() => {
    const saved = loadWorkout();
    if (!saved) return;

    runStartedRef.current = saved.runStartedAt;
    pausedAccumRef.current = saved.pausedAccumMs;
    pathRef.current = saved.path;
    setPath(saved.path);
    lastPathPointRef.current = saved.path[saved.path.length - 1] ?? null;
    // 복원 후 첫 GPS 포인트는 재정박 — 앱이 죽어있던 동안의 이동을 직선으로 이어
    // 거리에 합산하지 않는다(120m 넘는 갭은 지도에서 점선으로 표시됨).
    reanchorNextRef.current = true;
    // 저장된 라이브 거리를 우선 사용 — 경로 재계산은 안티치트로 차단됐던 구간·추적 끊김을
    // 직선으로 이어 거리를 부풀린다. 구버전 스냅샷만 갭 제외 재계산으로 폴백.
    const restoredDistance = saved.distanceM ?? creditedPathDistanceMeters(saved.path);
    distanceAccumRef.current = restoredDistance;
    setDistanceM(restoredDistance);

    // 방치 판정 앵커 복원 — 구버전 스냅샷(idleAnchor 없음)은 마지막 이동/저장 시각으로 근사.
    idleAnchorRef.current = saved.idleAnchor ?? {
      timeMs: saved.lastMovementAt ?? saved.savedAt,
      distanceM: restoredDistance,
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
      } else {
        pauseStartedRef.current = null;
        autoPausedRef.current = false;
        setAutoPaused(false);
        setElapsedSec(computeElapsedSec(saved.runStartedAt, saved.pausedAccumMs, null));
        setStatus("running");
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
    }
    // clampIdlePauseAt은 의존성 없는 안정 콜백 — 마운트 1회 복원이라 빈 배열을 유지한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (status !== "idle" || pathname !== "/workout") return;
    let cancelled = false;
    let watchId: number | null = null;

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
          setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setGeoError(null);
        },
        (err) => setGeoError(geolocationErrorMessage(err)),
        { enableHighAccuracy: true, maximumAge: 1_000, timeout: 30_000 },
      );
    }

    warmUp();
    return () => {
      cancelled = true;
      if (watchId != null && typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [status, pathname]);

  // ── 공개 액션 ─────────────────────────────────────────────────────────────
  const start = useCallback(() => {
    const now = Date.now();
    setPath([]);
    distanceAccumRef.current = 0;
    lastPathPointRef.current = null;
    lastAppendWallMsRef.current = null;
    reanchorNextRef.current = false;
    setDistanceM(0);
    setElapsedSec(0);
    vehicleStateRef.current = resetVehicleState();
    setVehicleTier("normal");
    pausedAccumRef.current = 0;
    pauseStartedRef.current = null;
    runStartedRef.current = now;
    autoPausedRef.current = false;
    idleAnchorRef.current = { timeMs: now, distanceM: 0 };
    setAutoPaused(false);
    lastRawPosRef.current = null;
    lastPosTimeRef.current = null;
    setStatus("running");
    startWatch();
    void track("running_start");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const altitude =
          pos.coords.altitude != null && Number.isFinite(pos.coords.altitude)
            ? pos.coords.altitude
            : undefined;
        const p: LatLng = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          ...(altitude != null ? { ele: altitude } : {}),
          // 시작 기준점에도 t를 부여 — 유령 격차·구간 기록이 첫 포인트부터 t에 의존한다.
          t: runStartedRef.current != null ? Date.now() - runStartedRef.current : 0,
        };
        setPosition(p);
        // 콜백이 GPS 워치보다 늦게 도착할 수 있다(최대 15초). 이미 워치가 경로를
        // 쌓기 시작했거나(초기 포인트 유실·거리 어긋남 방지) 그 사이 종료됐다면 시드하지 않는다.
        if (statusRef.current === "running" && lastPathPointRef.current == null) {
          lastPathPointRef.current = p;
          lastAppendWallMsRef.current = Date.now();
          setPath((prev) => (prev.length > 0 ? prev : [p]));
        }
      },
      (err) => setGeoError(geolocationErrorMessage(err)),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }, [startWatch]);

  const pause = useCallback(() => {
    if (statusRef.current !== "running") return;
    pauseStartedRef.current = Date.now();
    setAutoPaused(false);
    setStatus("paused");
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
  }, [clearWatch]);

  const resume = useCallback(() => {
    if (statusRef.current !== "paused") return;
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
    startWatch();
  }, [startWatch]);

  const stop = useCallback((): WorkoutFinishSnapshot | null => {
    if (statusRef.current === "idle" || runStartedRef.current == null) {
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
    autoPausedRef.current = false;
    idleAnchorRef.current = null;
    vehicleStateRef.current = resetVehicleState();
    distanceAccumRef.current = 0;
    lastPathPointRef.current = null;
    lastAppendWallMsRef.current = null;
    reanchorNextRef.current = false;
    setStatus("idle");
    setPath([]);
    setDistanceM(0);
    setElapsedSec(0);
    setVehicleTier("normal");
    setAutoPaused(false);

    return snapshot;
  }, [clearWatch, position, clampIdlePauseAt]);

  return {
    status,
    path,
    position,
    elapsedSec,
    distanceM,
    geoError,
    vehicleTier,
    autoPaused,
    elapsedLabel: formatClock(elapsedSec),
    paceLabel: formatPace(distanceM, elapsedSec, unit),
    calories: estimateCalories(distanceM),
    start,
    pause,
    resume,
    stop,
  };
}
