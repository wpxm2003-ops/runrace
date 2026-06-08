"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useConfirm } from "@/app/_components/ConfirmProvider";
import { ShareButton } from "@/app/_components/ShareButton";
import { Alert } from "@/app/_components/ui/Alert";
import { Skeleton } from "@/app/_components/ui/Skeleton";
import {
  deleteWorkout,
  invalidateWorkoutDetail,
  invalidateWorkoutLists,
  useWorkoutDetail,
} from "@/lib/api";
import { WorkoutTimeRange } from "@/app/_components/WorkoutTimeRange";
import { formatKm } from "@/lib/format";
import { useLocale } from "@/lib/i18n";
import { formatDuration, formatPaceMinPerKm } from "@/lib/workoutTrack";
import { shareLink } from "@/lib/shareCard";
import type { User } from "firebase/auth";

const WorkoutMap = dynamic(() => import("@/app/workout/_components/WorkoutMap"), {
  ssr: false,
  loading: () => (
    <div className="h-48 animate-pulse rounded-2xl bg-zinc-200 sm:h-64" aria-hidden />
  ),
});

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
  const { t } = useLocale();
  const confirm = useConfirm();
  const { data: detail, error, isLoading } = useWorkoutDetail(workoutId, user);
  const [deleting, setDeleting] = useState(false);

  async function onShare() {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://runrace.co.kr";
    return shareLink(`${appUrl}/workouts/${workoutId}/share`, "RunRace");
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
  const lastPosition = detail.path[detail.path.length - 1] ?? null;

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="relative h-48 sm:h-64">
          {isIndoor ? (
            detail.imageUrl ? (
              <img
                src={detail.imageUrl}
                alt="러닝머신 사진"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-zinc-50 text-sm text-zinc-400">
                🏃 실내러닝
              </div>
            )
          ) : (
            <WorkoutMap path={detail.path} position={lastPosition} follow={false} />
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
          <div className="text-xs text-zinc-500">{t.stat_time}</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">
            {formatDuration(detail.durationSec)}
          </div>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
          <div className="text-xs text-zinc-500">{t.stat_distance}</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">
            {formatKm(detail.distanceM)}
          </div>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
          <div className="text-xs text-zinc-500">{t.stat_pace}</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">
            {formatPaceMinPerKm(detail.distanceM, detail.durationSec)}
          </div>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
          <div className="text-xs text-zinc-500">{t.stat_calories}</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">
            {detail.calories} kcal
          </div>
        </div>
      </div>

      <WorkoutTimeRange startedAt={detail.startedAt} endedAt={detail.endedAt} t={t} />

      <ShareButton onShare={onShare} className="h-11 w-full rounded-xl border border-zinc-200 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50" />

      <button
        type="button"
        disabled={deleting}
        onClick={onDelete}
        className="h-11 w-full rounded-xl border border-red-200 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        {deleting ? t.workout_deleting_btn : t.records_delete_current}
      </button>
    </div>
  );
}
