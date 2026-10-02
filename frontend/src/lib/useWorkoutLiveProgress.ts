"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import type { LiveRivalGap } from "@/lib/api/types";
import { clearLiveProgress, pauseLiveProgress, postLiveProgress } from "@/lib/api/challenges";
import { isLatestLiveProgressResponse } from "./liveProgressFreshness";
import { computeWorkoutElapsedSec } from "./workoutSessionMath";
import type { VehicleDetectState, WorkoutStatus } from "./workoutTrack";

const LIVE_PING_INTERVAL_MS = 60_000;

type MutableRef<T> = { current: T };

export type LiveRivalGapEntry = LiveRivalGap & { challengeId: number };

type WorkoutLiveProgressRefs = {
  authUserRef: MutableRef<User | null>;
  statusRef: MutableRef<WorkoutStatus>;
  sessionOwnerUidRef: MutableRef<string | null>;
  clientWorkoutIdRef: MutableRef<string | null>;
  vehicleStateRef: MutableRef<VehicleDetectState>;
  autoPausedRef: MutableRef<boolean>;
  runStartedRef: MutableRef<number | null>;
  pausedAccumRef: MutableRef<number>;
  pauseStartedRef: MutableRef<number | null>;
  distanceAccumRef: MutableRef<number>;
};

/**
 * 서버의 실시간 레이스 진행률만 담당한다.
 * GPS 수집과 세션 상태 전이는 호출자가 소유하고, 이 훅은 현재 스냅샷을 읽어 순서가 보장된
 * 핑·일시정지·폐기 요청으로 변환한다.
 */
export function useWorkoutLiveProgress(
  status: WorkoutStatus,
  refs: WorkoutLiveProgressRefs,
) {
  const [liveRivalGaps, setLiveRivalGaps] = useState<LiveRivalGapEntry[]>([]);
  const pendingRef = useRef(0);
  const sentAtRef = useRef(0);

  const nextSentAt = useCallback(() => {
    const next = Math.max(Date.now(), sentAtRef.current + 1);
    sentAtRef.current = next;
    return next;
  }, []);

  const sendLivePing = useCallback((opts?: { force?: boolean }) => {
    if (!opts?.force && pendingRef.current > 0) return;
    pendingRef.current++;
    void (async () => {
      const ownerUid = refs.sessionOwnerUidRef.current;
      const clientWorkoutId = refs.clientWorkoutIdRef.current;
      const user = refs.authUserRef.current;
      if (
        refs.statusRef.current !== "running"
        || ownerUid == null
        || clientWorkoutId == null
        || user == null
        || user.uid !== ownerUid
        || refs.vehicleStateRef.current.tier !== "normal"
        || refs.autoPausedRef.current
      ) {
        return;
      }

      const elapsedSec = Math.max(
        1,
        computeWorkoutElapsedSec(
          refs.runStartedRef.current ?? Date.now(),
          refs.pausedAccumRef.current,
          refs.pauseStartedRef.current,
        ),
      );
      const sentAt = nextSentAt();
      const response = await postLiveProgress(
        Math.round(refs.distanceAccumRef.current),
        elapsedSec,
        sentAt,
        clientWorkoutId,
        user,
      );
      if (
        refs.sessionOwnerUidRef.current !== ownerUid
        || refs.statusRef.current !== "running"
        || !isLatestLiveProgressResponse(
          clientWorkoutId,
          sentAt,
          refs.clientWorkoutIdRef.current,
          sentAtRef.current,
        )
      ) return;

      setLiveRivalGaps(
        response.challenges.flatMap((challenge) =>
          challenge.rivalGaps.map((gap) => ({ ...gap, challengeId: challenge.challengeId })),
        ),
      );
    })().catch(() => {}).finally(() => {
      pendingRef.current--;
    });
  }, [nextSentAt, refs]);

  const pauseLiveRun = useCallback((expectedUid: string) => {
    const user = refs.authUserRef.current;
    if (user == null || user.uid !== expectedUid) return;
    void pauseLiveProgress(user, nextSentAt()).catch(() => {});
  }, [nextSentAt, refs]);

  const discardLiveRun = useCallback((expectedUid: string) => {
    const user = refs.authUserRef.current;
    if (user == null || user.uid !== expectedUid) return;
    setLiveRivalGaps([]);
    void clearLiveProgress(user, nextSentAt()).catch(() => {});
  }, [nextSentAt, refs]);

  const clearLiveRivalGaps = useCallback(() => setLiveRivalGaps([]), []);

  useEffect(() => {
    if (status !== "running") return;
    const timer = setInterval(sendLivePing, LIVE_PING_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [status, sendLivePing]);

  return {
    liveRivalGaps,
    sendLivePing,
    pauseLiveRun,
    discardLiveRun,
    clearLiveRivalGaps,
  };
}
