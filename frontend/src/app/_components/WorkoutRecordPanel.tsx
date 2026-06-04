"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Alert } from "@/app/_components/ui/Alert";
import { Card } from "@/app/_components/ui/Card";
import { fetchWorkout, type WorkoutDetail } from "@/lib/api";
import { formatDateTime, formatKm } from "@/lib/format";
import { useLocale } from "@/lib/i18n";
import { formatDuration, formatPaceMinPerKm } from "@/lib/workoutTrack";
import type { User } from "firebase/auth";

const WorkoutMap = dynamic(() => import("@/app/workout/_components/WorkoutMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-48 items-center justify-center rounded-2xl bg-zinc-100 text-sm text-zinc-500">
      Loading map...
    </div>
  ),
});

type Props = {
  workoutId: number;
  user: User;
};

export function WorkoutRecordPanel({ workoutId, user }: Props) {
  const { t } = useLocale();
  const [detail, setDetail] = useState<WorkoutDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDetail(null);
    setError(null);
    fetchWorkout(workoutId, user)
      .then(setDetail)
      .catch((e) => setError(String(e)));
  }, [workoutId, user]);

  if (error) {
    return <Alert>{error}</Alert>;
  }

  if (!detail) {
    return <Card className="text-sm text-zinc-600">{t.loading}</Card>;
  }

  const lastPosition = detail.path[detail.path.length - 1] ?? null;

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="relative h-48 sm:h-64">
          <WorkoutMap path={detail.path} position={lastPosition} follow={false} />
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

      <div className="rounded-2xl bg-white p-4 text-sm text-zinc-600 shadow-sm">
        <div>
          {t.workout_start_label} {formatDateTime(detail.startedAt)}
        </div>
        <div className="mt-1">
          {t.workout_end_label} {formatDateTime(detail.endedAt)}
        </div>
      </div>
    </div>
  );
}
