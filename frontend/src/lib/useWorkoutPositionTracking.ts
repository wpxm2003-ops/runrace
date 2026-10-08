"use client";

import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { GeoCoords } from "./backgroundGeo";
import { haversineMeters, shouldAppendPoint } from "./workoutPath";
import { computeWorkoutSpeedMps } from "./workoutSessionMath";
import {
  evaluateVehicleTier,
  normalizeGpsAccuracyM,
  pushAccuracySample,
  slideIdleAnchor,
  type IdleAnchor,
  type LatLng,
  type VehicleDetectState,
  type VehicleTier,
  type WorkoutStatus,
} from "./workoutTrack";
import type { GeoErrorState } from "./useWorkoutGpsWarmup";

type PositionRuntime = {
  status: MutableRefObject<WorkoutStatus>;
  sessionOwnerUid: MutableRefObject<string | null>;
  vehicleState: MutableRefObject<VehicleDetectState>;
  lastRawPosition: MutableRefObject<LatLng | null>;
  lastPositionTime: MutableRefObject<number | null>;
  lastPathPoint: MutableRefObject<LatLng | null>;
  lastAppendWallMs: MutableRefObject<number | null>;
  lastGpsFixAt: MutableRefObject<number | null>;
  distanceAccum: MutableRefObject<number>;
  runStarted: MutableRefObject<number | null>;
  pausedAccum: MutableRefObject<number>;
  idleAnchor: MutableRefObject<IdleAnchor | null>;
  reanchorNext: MutableRefObject<boolean>;
};

type Options = {
  runtime: PositionRuntime;
  isCurrentSessionOwner: () => boolean;
  autoPauseIfIdle: (nowMs: number) => boolean;
  pauseLiveRun: (expectedUid: string) => void;
  sendLivePing: (options?: { force?: boolean }) => void;
  setGeoErrorState: Dispatch<SetStateAction<GeoErrorState | null>>;
  setPosition: Dispatch<SetStateAction<LatLng | null>>;
  setVehicleTier: Dispatch<SetStateAction<VehicleTier>>;
  setPath: Dispatch<SetStateAction<LatLng[]>>;
  setDistanceM: Dispatch<SetStateAction<number>>;
};

/** GPS 좌표 한 건을 차량 판정, 경로 단절, 거리 누적 상태로 반영한다. */
export function createWorkoutPositionTracker({
  runtime,
  isCurrentSessionOwner,
  autoPauseIfIdle,
  pauseLiveRun,
  sendLivePing,
  setGeoErrorState,
  setPosition,
  setVehicleTier,
  setPath,
  setDistanceM,
}: Options) {
  return (coords: GeoCoords) => {
    if (!isCurrentSessionOwner() || runtime.status.current !== "running") return;
    setGeoErrorState(null);
    const now = Date.now();
    runtime.lastGpsFixAt.current = now;
    const accuracyM = normalizeGpsAccuracyM(coords.accuracy);
    const point: LatLng = { lat: coords.latitude, lng: coords.longitude };
    setPosition(point);

    let speedMps = coords.speed ?? null;
    if (speedMps == null && runtime.lastRawPosition.current && runtime.lastPositionTime.current) {
      speedMps = computeWorkoutSpeedMps(
        runtime.lastRawPosition.current,
        point,
        now - runtime.lastPositionTime.current,
      );
    }
    const accuracyRecent = pushAccuracySample(
      runtime.vehicleState.current.accuracyRecent,
      now,
      accuracyM,
    );
    const previousTier = runtime.vehicleState.current.tier;
    const vehicle = evaluateVehicleTier({
      speedMps,
      accuracyM,
      nowMs: now,
      state: { ...runtime.vehicleState.current, accuracyRecent },
    });
    runtime.vehicleState.current = {
      tier: vehicle.tier,
      suspectHighSinceMs: vehicle.suspectHighSinceMs,
      confirmedHighSinceMs: vehicle.confirmedHighSinceMs,
      lowSpeedSinceMs: vehicle.lowSpeedSinceMs,
      weakGpsSinceMs: vehicle.weakGpsSinceMs,
      recoveringFromWeakGps: vehicle.recoveringFromWeakGps,
      hasHadGoodFix: vehicle.hasHadGoodFix,
      accuracyRecent: vehicle.accuracyRecent,
    };

    if (previousTier === "normal" && vehicle.tier !== "normal") {
      const ownerUid = runtime.sessionOwnerUid.current;
      if (ownerUid != null) pauseLiveRun(ownerUid);
    } else if (previousTier !== "normal" && vehicle.tier === "normal") {
      sendLivePing({ force: true });
    }
    setVehicleTier(vehicle.tier);

    runtime.lastRawPosition.current = point;
    runtime.lastPositionTime.current = now;
    const last = runtime.lastPathPoint.current;
    if (autoPauseIfIdle(now) || vehicle.blockPathPoints) return;

    const reanchor = vehicle.reanchorNextPoint || runtime.reanchorNext.current;
    const elapsedMs = runtime.runStarted.current != null
      ? now - runtime.runStarted.current - runtime.pausedAccum.current
      : undefined;
    const pointWithTime: LatLng = {
      ...point,
      ...(elapsedMs != null ? { t: elapsedMs } : {}),
      ...(reanchor && last ? { breakBefore: true } : {}),
    };
    if (!reanchor && last && !shouldAppendPoint(last, pointWithTime)) return;

    const increment = vehicle.blockDistance || reanchor || !last
      ? 0
      : haversineMeters(last, pointWithTime);
    runtime.distanceAccum.current += increment;
    runtime.lastPathPoint.current = pointWithTime;
    runtime.lastAppendWallMs.current = now;
    runtime.reanchorNext.current = false;
    if (!vehicle.blockDistance && runtime.idleAnchor.current != null) {
      runtime.idleAnchor.current = slideIdleAnchor(
        runtime.idleAnchor.current,
        now,
        runtime.distanceAccum.current,
        point,
      );
    }
    setPath((previous) => [...previous, pointWithTime]);
    setDistanceM(runtime.distanceAccum.current);
  };
}
