"use client";

import { useState } from "react";
import { useConfirm } from "@/app/_components/ConfirmProvider";
import { ShareButton } from "@/app/_components/ShareButton";
import { Alert } from "@/app/_components/ui/Alert";
import { Skeleton } from "@/app/_components/ui/Skeleton";
import { Button } from "@/app/_components/ui/Button";
import {
  deleteWorkout,
  invalidateWorkoutDetail,
  invalidateWorkoutLists,
  useWorkoutDetail,
} from "@/lib/api";
import { WorkoutTimeRange } from "@/app/_components/WorkoutTimeRange";
import { WorkoutMedia } from "@/app/_components/WorkoutMedia";
import { WorkoutStatGrid } from "@/app/_components/WorkoutStatGrid";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import { getAppUrl } from "@/lib/appUrl";
import type { User } from "firebase/auth";

type Props = {
  workoutId: number;
  user: User;
  viewYear: number;
  onDeleted?: () => void;
};

function StatCardSkeleton() {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
      <Skeleton className="h-3 w-12" />
      <Skeleton className="mt-2 h-6 w-16" />
    </div>
  );
}

function WorkoutRecordPanelSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="h-48 animate-pulse bg-zinc-200 sm:h-64" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <Skeleton className="h-4 w-full max-w-xs" />
        <Skeleton className="mt-2 h-4 w-full max-w-xs" />
      </div>
      <Skeleton className="h-11 w-full rounded-xl" />
    </div>
  );
}

export function WorkoutRecordPanel({
  workoutId,
  user,
  viewYear,
  onDeleted,
}: Props) {
  const { t, locale } = useLocale();
  const { unit } = useUnit();
  const confirm = useConfirm();
  const { data: detail, error, isLoading } = useWorkoutDetail(workoutId, user);
  const [deleting, setDeleting] = useState(false);

  async function onShare() {
    const { shareLink } = await import("@/lib/shareCard");
    return shareLink(`${getAppUrl()}/workouts/${workoutId}/share`, "RunRace");
  }

  async function onDelete() {
    const ok = await confirm({
      title: t.workout_delete_title,
      message: t.workout_delete_message,
      confirmLabel: t.delete,
      cancelLabel: t.cancel,
      destructive: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteWorkout(workoutId, user);
      invalidateWorkoutDetail(workoutId, user.uid);
      invalidateWorkoutLists(user.uid, viewYear);
      onDeleted?.();
    } catch {
      setDeleting(false);
    }
  }

  if (error) {
    return <Alert>{String(error)}</Alert>;
  }

  if (isLoading || !detail) {
    return <WorkoutRecordPanelSkeleton />;
  }

  const isIndoor = detail.workoutType === "INDOOR";

  return (
    <div className="space-y-4">
      <WorkoutMedia
        isIndoor={isIndoor}
        imageUrl={detail.imageUrl ?? null}
        path={detail.path}
        heightClass="h-48 sm:h-64"
      />

      <WorkoutStatGrid
        durationSec={detail.durationSec}
        distanceM={detail.distanceM}
        calories={detail.calories}
        unit={unit}
        labels={{
          time: t.stat_time,
          distance: t.stat_distance,
          pace: t.stat_pace,
          calories: t.stat_calories,
        }}
      />

      <WorkoutTimeRange startedAt={detail.startedAt} endedAt={detail.endedAt} t={t} locale={locale} />

      <ShareButton onShare={onShare} className="h-11 w-full rounded-xl border border-zinc-200 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50" />

      <Button
        variant="destructive"
        disabled={deleting}
        onClick={onDelete}
        className="h-11 w-full"
      >
        {deleting ? t.workout_deleting_btn : t.records_delete_current}
      </Button>
    </div>
  );
}
