"use client";

import { useEffect, useState } from "react";
import { useConfirm } from "@/app/_components/ConfirmProvider";
import { ShareButton } from "@/app/_components/ShareButton";
import { ShareCardButton } from "@/app/workouts/[id]/share/_components/ShareCardButton";
import { Alert } from "@/app/_components/ui/Alert";
import { Skeleton } from "@/app/_components/ui/Skeleton";
import { Button } from "@/app/_components/ui/Button";
import {
  deleteWorkout,
  invalidateWorkoutDetail,
  invalidateWorkoutLists,
  useWorkoutDetail,
} from "@/lib/api";
import { WorkoutMemoEditor } from "@/app/_components/WorkoutMemoEditor";
import { WorkoutTimeRange } from "@/app/_components/WorkoutTimeRange";
import { WorkoutMedia } from "@/app/_components/WorkoutMedia";
import { WorkoutStatGrid, workoutStatLabels } from "@/app/_components/WorkoutStatGrid";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import { getAppUrl } from "@/lib/appUrl";
import type { User } from "firebase/auth";

type Props = {
  workoutId: number;
  user: User;
  viewYear: number;
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
}: Props) {
  const { t, locale } = useLocale();
  const { unit } = useUnit();
  const confirm = useConfirm();
  const { data: detail, error, isLoading } = useWorkoutDetail(workoutId, user);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setDeleting(false);
  }, [workoutId]);

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
        labels={workoutStatLabels(t)}
      />

      <WorkoutTimeRange startedAt={detail.startedAt} endedAt={detail.endedAt} t={t} locale={locale} />

      <WorkoutMemoEditor workoutId={workoutId} initialMemo={detail.memo} user={user} />

      <div className="flex gap-2">
        <ShareButton onShare={onShare} variant="secondary" className="h-11 flex-1" />
        <ShareCardButton
          data={detail}
          unit={unit}
          locale={locale}
          t={t}
          triggerClassName="h-11 flex-1"
        />
      </div>

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
