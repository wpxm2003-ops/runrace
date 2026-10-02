"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { User } from "firebase/auth";
import { createWorkout, logNsmSession } from "@/lib/api";
import type { Achievement, NsmSessionLogBody, PersonalBest } from "@/lib/api/types";
import type { WorkoutFinishSnapshot } from "@/lib/workoutTrack";
import { computeBestSegments } from "@/lib/workoutTrack";
import { withRetry } from "@/lib/retry";
import { track, distanceBucket } from "@/lib/analytics";
import { normalizeGhostRaceResult, type GhostRaceResult } from "@/lib/ghostRace";
import { clearPendingWorkoutSaveIfMatches, type PendingWorkoutSave } from "@/lib/workoutPendingSave";
import { celebrationTone } from "@/lib/celebration";
import { achievementViews } from "@/lib/achievements";
import { nativeNavigate } from "@/lib/nativeNav";
import type { Translations } from "@/lib/i18n/translations";
import type { DistanceUnit } from "@/lib/units";

export type CelebrationState = {
  recordId: number; personalBest: PersonalBest | null; achievements: Achievement[];
  ghostResult: GhostRaceResult | null; ghostLabel: string | null; showNsmCta: boolean;
};

type Props = {
  user: User | null; t: Translations; unit: DistanceUnit;
  currentUserUidRef: MutableRefObject<string | null>;
  setSaveError: Dispatch<SetStateAction<string | null>>;
  setSaving: Dispatch<SetStateAction<boolean>>;
  setPendingSave: Dispatch<SetStateAction<PendingWorkoutSave | null>>;
  setCelebration: Dispatch<SetStateAction<CelebrationState | null>>;
};

export function useWorkoutSave({ user, t, unit, currentUserUidRef, setSaveError, setSaving, setPendingSave, setCelebration }: Props) {
  const saveSnapshot = useCallback(
    async (
      ownerUid: string,
      snapshot: WorkoutFinishSnapshot,
      ghostWorkoutId: number | null,
      ghostResult: GhostRaceResult | null,
      ghostLabel: string | null,
      showNsmCta: boolean,
      nsmLog: NsmSessionLogBody | null,
    ) => {
      // 종료 확인창·재시도 중 계정이 바뀌었으면 새 계정 토큰으로 이전 계정의 런을
      // 저장하지 않는다. 호출 시 캡처한 UID와 현재 Firebase 사용자가 모두 같아야 한다.
      if (!user || user.uid !== ownerUid) return;
      const ownerUser = user;
      setSaveError(null);
      setSaving(true);
      try {
        // 1차 방어: 3초 간격 3회 자동 재시도 (서버 재시작·네트워크 깜빡임 흡수)
        const bestSegments = computeBestSegments(snapshot.path);
        const persistedGhostResult = ghostResult ? normalizeGhostRaceResult(ghostResult) : null;
        const res = await withRetry(
          () => {
            // 3초 재시도 대기 중 계정이 바뀌었으면 더는 네트워크 요청을 만들지 않는다.
            if (currentUserUidRef.current !== ownerUid) {
              throw new Error("workout_owner_changed");
            }
            return createWorkout(
              {
                clientWorkoutId: snapshot.clientWorkoutId,
                startedAt: snapshot.startedAt,
                startedAtLocal: snapshot.startedAtLocal,
                endedAt: snapshot.endedAt,
                durationSec: snapshot.durationSec,
                distanceM: snapshot.distanceM,
                calories: snapshot.calories,
                avgPaceSecPerKm: snapshot.avgPaceSecPerKm,
                path: snapshot.path,
                bestSegments,
                ghostWorkoutId,
                ghostResult: persistedGhostResult,
              },
              ownerUser,
            );
          },
          3,
          3000,
        );
        // sub-T 세션 수행 기록 — best-effort. 실패해도 런 저장은 이미 끝났으므로 흐름을 막지 않는다.
        if (nsmLog) {
          void logNsmSession({ ...nsmLog, workoutId: res.id }, ownerUser).catch(() => {});
        }
        const distanceKm = snapshot.distanceM / 1000;
        void track("running_end", {
          distance_km: Math.round(distanceKm * 100) / 100,
          duration_sec: snapshot.durationSec,
          pace: snapshot.avgPaceSecPerKm ?? 0,
          calories: snapshot.calories ?? 0,
        });
        void track("record_saved", { distance_bucket: distanceBucket(distanceKm) });
        if (ghostWorkoutId != null && ghostResult != null) {
          const deltaSec = Math.round(ghostResult.deltaMs / 1000);
          void track("ghost_race_completed", {
            ghost_workout_id: ghostWorkoutId,
            result: deltaSec === 0 ? "tie" : deltaSec < 0 ? "win" : "loss",
            delta_sec: deltaSec,
            overlap_m: Math.round(ghostResult.overlapDistanceM),
          });
        }
        // 방금 저장한 것이 보관 중이던 그 스냅샷일 때만 비운다 — 새 런의 저장 성공이
        // 이전에 실패해 보관해둔 다른 런을 폐기하면 그 기록은 영구 유실된다.
        setPendingSave((prev) => (prev && prev.snapshot === snapshot ? null : prev));
        clearPendingWorkoutSaveIfMatches(snapshot.clientWorkoutId);
        if (currentUserUidRef.current === ownerUid) {
          const personalBest = res.personalBest ?? null;
          const achievements = res.achievements ?? [];
          // 보여줄 카드가 없으면 모달을 건너뛰고 바로 상세로 — 안 그러면 종료된 운동 화면에 갇힌다.
          const { show } = celebrationTone({
            achievementCount: achievementViews(achievements, t, unit).length,
            personalBest,
            ghostResult,
            ghostLabel,
          });
          if (show) {
            setCelebration({
              recordId: res.id,
              personalBest,
              achievements,
              ghostResult,
              ghostLabel,
              showNsmCta,
            });
          } else {
            nativeNavigate(`/workouts/${res.id}`);
          }
        }
      } catch {
        // 2차 방어: 친절 안내 + 스냅샷 보관(데이터 보존) → 재시도 버튼 노출
        if (currentUserUidRef.current === ownerUid) {
          setSaveError(t.workout_save_failed);
          setPendingSave({
            ownerUid,
            snapshot,
            ghostWorkoutId,
            ghostResult,
            ghostLabel,
            showNsmCta,
            nsmLog,
          });
        }
      } finally {
        setSaving(false);
      }
    },
    [
      user, t, unit, currentUserUidRef, setCelebration, setPendingSave,
      setSaveError, setSaving,
    ],
  );

  return saveSnapshot;
}
