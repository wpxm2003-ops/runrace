"use client";

import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { Capacitor } from "@capacitor/core";
import { waitForNativePermissions } from "./nativePermissions";
import {
  geolocationBlockedCode,
  geolocationErrorCode,
  normalizeGpsAccuracyM,
  type GeoErrorCode,
  type LatLng,
  type WorkoutStartFix,
  type WorkoutStatus,
} from "./workoutTrack";

const WARMUP_FIX_BUFFER_SIZE = 6;

type MutableRef<T> = { current: T };

export type GeoErrorState = { code: GeoErrorCode } | { text: string };

type WorkoutGpsWarmupInput = {
  authLoading: boolean;
  currentUid: string | null;
  status: WorkoutStatus;
  pathname: string;
  currentUidRef: MutableRef<string | null>;
  statusRef: MutableRef<WorkoutStatus>;
  setPosition: Dispatch<SetStateAction<LatLng | null>>;
  setGeoErrorState: Dispatch<SetStateAction<GeoErrorState | null>>;
};

/** 운동 화면의 idle 상태에서 GPS를 미리 데우고, 시작점 후보를 짧게 보관한다. */
export function useWorkoutGpsWarmup({
  authLoading,
  currentUid,
  status,
  pathname,
  currentUidRef,
  statusRef,
  setPosition,
  setGeoErrorState,
}: WorkoutGpsWarmupInput) {
  const warmupFixesRef = useRef<WorkoutStartFix[]>([]);

  useEffect(() => {
    if (authLoading || currentUid == null || status !== "idle" || pathname !== "/workout") {
      return;
    }
    let cancelled = false;
    let watchId: number | null = null;
    const warmupUid = currentUid;
    warmupFixesRef.current = [];

    async function warmUp() {
      const blocked = geolocationBlockedCode();
      if (blocked) {
        setGeoErrorState({ code: blocked });
        return;
      }
      if (Capacitor.isNativePlatform()) await waitForNativePermissions();
      if (cancelled || typeof navigator === "undefined" || !navigator.geolocation) return;

      watchId = navigator.geolocation.watchPosition(
        (position) => {
          if (
            cancelled
            || currentUidRef.current !== warmupUid
            || statusRef.current !== "idle"
          ) return;

          const receivedAtMs = Date.now();
          warmupFixesRef.current = [
            ...warmupFixesRef.current,
            {
              ownerUid: warmupUid,
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              accuracyM: normalizeGpsAccuracyM(position.coords.accuracy),
              fixAtMs: position.timestamp,
              receivedAtMs,
            },
          ].slice(-WARMUP_FIX_BUFFER_SIZE);
          setPosition({ lat: position.coords.latitude, lng: position.coords.longitude });
          setGeoErrorState(null);
        },
        (error) => {
          if (
            !cancelled
            && currentUidRef.current === warmupUid
            && statusRef.current === "idle"
          ) setGeoErrorState({ code: geolocationErrorCode(error) });
        },
        { enableHighAccuracy: true, maximumAge: 1_000, timeout: 30_000 },
      );
    }

    void warmUp();
    return () => {
      cancelled = true;
      warmupFixesRef.current = [];
      if (watchId != null && typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [
    authLoading,
    currentUid,
    currentUidRef,
    pathname,
    setGeoErrorState,
    setPosition,
    status,
    statusRef,
  ]);

  return warmupFixesRef;
}
