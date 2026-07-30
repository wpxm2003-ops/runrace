"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  autoPauseStartedAt,
  estimateCalories,
  evaluateVehicleTier,
  formatClock,
  haversineMeters,
  normalizeGpsAccuracyM,
  creditedPathDistanceMeters,
  pushAccuracySample,
  shouldAutoResume,
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
  const lastMovementAtRef = useRef<number | null>(null);
  const stationarySinceRef = useRef<number | null>(null);

  // ── 탈것 Tiered 감지 레프 ─────────────────────────────────────────────────
  const vehicleStateRef = useRef<VehicleDetectState>(resetVehicleState());
  const lastPosTimeRef = useRef<number | null>(null);
  const lastRawPosRef = useRef<LatLng | null>(null);
  const distanceAccumRef = useRef(0);
  /** 경로에 마지막으로 추가된 점 — 증분 거리 계산용(setState 업데이터 밖에서 유지). */
  const lastPathPointRef = useRef<LatLng | null>(null);
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
      lastMovementAt: lastMovementAtRef.current ?? undefined,
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
        lastMovementAt: lastMovementAtRef.current ?? undefined,
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
   * GPS 워처는 유지한 채 활동시간만 멈춘다. 마지막 이동 시각을 기준으로 소급하므로
   * 백그라운드 타이머가 늦게 깨어나도 정지 시간이 페이스에 섞이지 않는다.
   */
  const beginAutoPauseIfDue = useCallback((nowMs: number): boolean => {
    if (
      statusRef.current !== "running" ||
      autoPausedRef.current ||
      pauseStartedRef.current != null ||
      !vehicleStateRef.current.hasHadGoodFix ||
      lastPathPointRef.current == null
    ) {
      return false;
    }
    const startedAt = autoPauseStartedAt({
      lastMovementAt: lastMovementAtRef.current,
      stationarySinceAt: stationarySinceRef.current,
      nowMs,
    });
    if (startedAt == null) return false;

    pauseStartedRef.current = startedAt;
    autoPausedRef.current = true;
    reanchorNextRef.current = true;
    setAutoPaused(true);
    void track("running_auto_pause");
    return true;
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

      if (autoPausedRef.current) {
        // GPS 감시는 살아 있다. 양호한 GPS에서 보행 수준의 실제 이동이 확인될 때만
        // 자동 재개해 집 안 좌표 흔들림이나 차량 탑승으로 시계가 다시 돌지 않게 한다.
        if (
          vehicle.tier !== "normal" ||
          vehicle.blockDistance ||
          !shouldAutoResume(last, point, speedMps, accuracyM)
        ) {
          return;
        }
        if (pauseStartedRef.current != null) {
          pausedAccumRef.current += now - pauseStartedRef.current;
        }
        pauseStartedRef.current = null;
        autoPausedRef.current = false;
        stationarySinceRef.current = null;
        lastMovementAtRef.current = now;
        reanchorNextRef.current = true;
        setAutoPaused(false);
        void track("running_auto_resume");
      } else if (!vehicle.blockDistance) {
        const movedEnough = last != null && shouldAppendPoint(last, point);
        const speedShowsMovement = speedMps != null && speedMps >= 0.6;
        if (last == null || movedEnough || speedShowsMovement) {
          lastMovementAtRef.current = now;
          stationarySinceRef.current = null;
        } else if (
          coords.speed != null &&
          coords.speed <= 0.2 &&
          accuracyM != null &&
          accuracyM <= 20
        ) {
          // OS가 속도 0에 가까운 양호한 fix를 연속 제공할 때는 빠른(5초) 정지 판정을 쓴다.
          stationarySinceRef.current ??= now;
        } else {
          stationarySinceRef.current = null;
        }
      } else {
        // suspect 단계는 "탈것 확정 전"이라 경로를 계속 기록한다는 약속(배너 문구)이
        // 있다 — 실제 변위가 이어지는 동안은 이동 시각도 갱신해, 고속 스퍼트(내리막
        // 21km/h+)가 15초 지속될 때 자동멈춤이 오발동해 시계·경로가 끊기는 것을 막는다.
        // confirmed·weak_gps는 갱신하지 않아 15초 뒤 의도대로 멈춘다 — 운동 종료를
        // 깜빡한 채 지하철·차량에 타면 페이스가 오염되는 것을 막는 게 자동멈춤의 목적.
        if (vehicle.tier === "suspect" && last != null && shouldAppendPoint(last, point)) {
          lastMovementAtRef.current = now;
        }
        stationarySinceRef.current = null;
      }

      if (beginAutoPauseIfDue(now)) return;
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
      reanchorNextRef.current = false;
      setPath((prev) => [...prev, pointWithT]);
      setDistanceM(distanceAccumRef.current);
    },
    [peekSpeedMps, commitRawPosition, beginAutoPauseIfDue],
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
  useEffect(() => {
    if (status !== "running") return;
    const id = window.setInterval(() => {
      if (!runStartedRef.current) return;
      beginAutoPauseIfDue(Date.now());
      setElapsedSec(
        computeElapsedSec(
          runStartedRef.current,
          pausedAccumRef.current,
          pauseStartedRef.current,
        ),
      );
    }, 1000);
    return () => clearInterval(id);
  }, [status, beginAutoPauseIfDue]);

  // ── 마운트 시 세션 복원 (탭 이탈 ≠ 일시정지, running이면 GPS 재개) ───────
  useEffect(() => {
    const saved = loadWorkout();
    if (!saved) return;

    runStartedRef.current = saved.runStartedAt;
    pausedAccumRef.current = saved.pausedAccumMs;
    lastMovementAtRef.current = saved.lastMovementAt ?? saved.savedAt;
    stationarySinceRef.current = null;
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

    if (saved.status === "running") {
      // 경로가 0포인트면 자동멈춤을 추론하지 않는다 — 재개 판정(shouldAutoResume)이
      // 앵커 포인트를 요구해서, 앵커 없이 멈추면 영원히 재개될 수 없는 데드락이 된다
      // (라이브 발동 쪽 lastPathPoint null 가드와 같은 이유의 복원판. GPS 콜드스타트
      // 중 WebView가 재구성되는 경우가 정확히 이 경로다).
      const canInferAutoPause = saved.path.length > 0;
      const restoredAutoPauseStartedAt = !canInferAutoPause
        ? null
        : saved.autoPaused && saved.pauseStartedAt != null
          ? saved.pauseStartedAt
          : autoPauseStartedAt({
              lastMovementAt: lastMovementAtRef.current,
              stationarySinceAt: null,
              nowMs: Date.now(),
            });
      const restoredAutoPaused = restoredAutoPauseStartedAt != null;
      pauseStartedRef.current = restoredAutoPauseStartedAt;
      autoPausedRef.current = restoredAutoPaused;
      setAutoPaused(restoredAutoPaused);
      setElapsedSec(
        computeElapsedSec(
          saved.runStartedAt,
          saved.pausedAccumMs,
          restoredAutoPauseStartedAt,
        ),
      );
      setStatus("running");
      pendingResumeWatchRef.current = true;
    } else {
      // 자동 정지 뒤 사용자가 수동 일시정지 버튼을 누른 상태라면 종료 시각 보정 힌트는 유지한다.
      autoPausedRef.current = saved.autoPaused === true;
      setAutoPaused(false);
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
    reanchorNextRef.current = false;
    setDistanceM(0);
    setElapsedSec(0);
    vehicleStateRef.current = resetVehicleState();
    setVehicleTier("normal");
    pausedAccumRef.current = 0;
    pauseStartedRef.current = null;
    runStartedRef.current = now;
    autoPausedRef.current = false;
    lastMovementAtRef.current = now;
    stationarySinceRef.current = null;
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
          setPath((prev) => (prev.length > 0 ? prev : [p]));
        }
      },
      (err) => setGeoError(geolocationErrorMessage(err)),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }, [startWatch]);

  const pause = useCallback(() => {
    if (statusRef.current !== "running") return;
    // 자동 일시정지 상태에서 사용자가 버튼을 누르면 기존 정지 시작 시각을 보존한다.
    // 그래야 귀가 후 몇 시간 뒤 종료해도 활동 종료 시각과 페이스가 집 도착 시점에 맞는다.
    if (!autoPausedRef.current) {
      pauseStartedRef.current = Date.now();
    }
    stationarySinceRef.current = null;
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
    lastMovementAtRef.current = now;
    stationarySinceRef.current = null;
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
    // 백그라운드에서 JS 타이머가 멈췄다가 종료 버튼과 함께 깨어난 경우도 마지막으로 보정한다.
    if (
      statusRef.current === "running" &&
      !autoPausedRef.current &&
      lastPathPointRef.current != null
    ) {
      const inferred = autoPauseStartedAt({
        lastMovementAt: lastMovementAtRef.current,
        stationarySinceAt: stationarySinceRef.current,
        nowMs: now,
      });
      if (inferred != null) {
        pauseStartedRef.current = inferred;
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
    lastMovementAtRef.current = null;
    stationarySinceRef.current = null;
    vehicleStateRef.current = resetVehicleState();
    distanceAccumRef.current = 0;
    lastPathPointRef.current = null;
    reanchorNextRef.current = false;
    setStatus("idle");
    setPath([]);
    setDistanceM(0);
    setElapsedSec(0);
    setVehicleTier("normal");
    setAutoPaused(false);

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
