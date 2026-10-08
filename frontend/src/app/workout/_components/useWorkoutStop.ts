"use client";

import { useCallback, type MutableRefObject } from "react";
import type { User } from "firebase/auth";
import { useConfirm } from "@/app/_components/ConfirmProvider";
import type { GhostSelection } from "@/app/workout/_components/GhostPicker";
import { buildNsmLog } from "@/app/workout/workoutNsmLog";
import type { TrainingPlan } from "@/lib/api/types";
import { computeGhostRaceResult } from "@/lib/ghostRace";
import type { Translations } from "@/lib/i18n/translations";
import type { NsmSession } from "@/lib/nsm";
import { isGhostLoss, recordGhostLossStreak, shouldShowNsmCta } from "@/lib/nsmCta";
import { clearNsmProgress } from "@/lib/nsmSessionProgress";
import { savePendingWorkoutSave } from "@/lib/workoutPendingSave";
import type { WorkoutSessionValue } from "@/lib/WorkoutSessionProvider";
import type { useWorkoutSave } from "@/app/workout/_components/useWorkoutSave";

type SaveSnapshot = ReturnType<typeof useWorkoutSave>;

type Props = {
  user: User | null;
  session: WorkoutSessionValue;
  t: Translations;
  ghost: GhostSelection | null;
  clearGhost: () => void;
  trainingPlan: TrainingPlan | null | undefined;
  nsmToday: NsmSession | null;
  saveSnapshot: SaveSnapshot;
  currentUserUidRef: MutableRefObject<string | null>;
  setSaveError: (error: string | null) => void;
};

export function useWorkoutStop({
  user,
  session,
  t,
  ghost,
  clearGhost,
  trainingPlan,
  nsmToday,
  saveSnapshot,
  currentUserUidRef,
  setSaveError,
}: Props) {
  const confirm = useConfirm();

  return useCallback(async () => {
    if (!user) return;
    const ownerUid = user.uid;

    if (session.distanceM < 1) {
      const confirmed = await confirm({
        title: t.workout_save_empty_title,
        message: t.workout_save_empty_message,
        confirmLabel: t.save,
        cancelLabel: t.cancel,
      });
      if (currentUserUidRef.current !== ownerUid) return;
      if (!confirmed) {
        session.stop(ownerUid);
        session.discardLiveRun(ownerUid);
        setSaveError(null);
        clearGhost();
        return;
      }
    }

    const snapshot = session.stop(ownerUid);
    if (!snapshot) return;
    const nsmLog = buildNsmLog(nsmToday);
    clearNsmProgress();
    if (snapshot.path.length === 0) {
      session.discardLiveRun(ownerUid);
      setSaveError(t.workout_no_route);
      clearGhost();
      return;
    }

    const ghostResult = ghost ? computeGhostRaceResult(snapshot.path, ghost.path) : null;
    const ghostLabel = ghost?.label ?? null;
    const lossStreak = ghost && ghostResult
      ? recordGhostLossStreak(ghost.id, isGhostLoss(ghostResult))
      : 0;
    const showNsmCta = ghostResult != null && shouldShowNsmCta({
      hasPlan: trainingPlan !== null,
      result: ghostResult,
      lossStreak,
    });
    const ghostWorkoutId = ghostResult ? ghost?.id ?? null : null;
    clearGhost();

    savePendingWorkoutSave({
      ownerUid,
      snapshot,
      ghostWorkoutId,
      ghostResult,
      ghostLabel,
      showNsmCta,
      nsmLog,
    });
    await saveSnapshot(
      ownerUid,
      snapshot,
      ghostWorkoutId,
      ghostResult,
      ghostLabel,
      showNsmCta,
      nsmLog,
    );
  }, [
    clearGhost,
    confirm,
    currentUserUidRef,
    ghost,
    nsmToday,
    saveSnapshot,
    session,
    setSaveError,
    t,
    trainingPlan,
    user,
  ]);
}
