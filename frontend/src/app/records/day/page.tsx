"use client";

import { useMemo, useSyncExternalStore } from "react";
import { PageLayout } from "@/app/_components/PageLayout";
import { WorkoutAggregateStats } from "@/app/_components/WorkoutAggregateStats";
import { Alert } from "@/app/_components/ui/Alert";
import { Card } from "@/app/_components/ui/Card";
import { LoadingCard } from "@/app/_components/ui/LoadingCard";
import { SkeletonLines } from "@/app/_components/ui/Skeleton";
import { useWorkoutListByYear, toDisplayError } from "@/lib/api";
import type { WorkoutListItem } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { useLocale } from "@/lib/i18n";
import { nativeNavigate } from "@/lib/nativeNav";
import { isRecordDateKey } from "@/lib/recordsRoute";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useUnit } from "@/lib/UnitContext";
import { formatDistance, formatPace, type DistanceUnit } from "@/lib/units";
import { aggregateWorkouts, workoutsOnDate } from "@/lib/workoutStats";
import { formatDuration } from "@/lib/workoutTrack";

function useDateParam(): string | null {
  return useSyncExternalStore(
    () => () => {},
    () => {
      if (typeof window === "undefined") return null;
      const value = new URLSearchParams(window.location.search).get("date");
      return isRecordDateKey(value) ? value : null;
    },
    () => null,
  );
}

function formatRecordDate(dateKey: string, locale: string): string {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

function WorkoutDayCard({
  workout,
  locale,
  unit,
  t,
}: {
  workout: WorkoutListItem;
  locale: string;
  unit: DistanceUnit;
  t: ReturnType<typeof useLocale>["t"];
}) {
  return (
    <button
      type="button"
      onClick={() => nativeNavigate(`/workouts/${workout.id}`)}
      className="w-full rounded-2xl border border-zinc-100 bg-white p-4 text-left shadow-sm hover:bg-zinc-50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-zinc-900">
            {formatDateTime(workout.startedAt, locale)}
          </div>
          {workout.workoutType === "INDOOR" ? (
            <div className="mt-1 inline-flex rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600">
              {t.indoor_badge}
            </div>
          ) : null}
        </div>
        <span className="shrink-0 text-lg leading-none text-zinc-300" aria-hidden="true">
          {">"}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div>
          <div className="text-xs text-zinc-400">{t.stat_distance}</div>
          <div className="mt-0.5 font-semibold tabular-nums text-zinc-900">
            {formatDistance(workout.distanceM, unit)}
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-400">{t.stat_time}</div>
          <div className="mt-0.5 font-semibold tabular-nums text-zinc-900">
            {formatDuration(workout.durationSec)}
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-400">{t.stat_pace}</div>
          <div className="mt-0.5 font-semibold tabular-nums text-zinc-900">
            {formatPace(workout.distanceM, workout.durationSec, unit)}
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-400">{t.stat_calories}</div>
          <div className="mt-0.5 font-semibold tabular-nums text-zinc-900">
            {workout.calories} kcal
          </div>
        </div>
      </div>
    </button>
  );
}

export default function RecordsDayPage() {
  const dateKey = useDateParam();
  const { t, locale } = useLocale();
  const { unit } = useUnit();
  const { user, loading } = useRequireAuth(
    dateKey ? `/records/day?date=${encodeURIComponent(dateKey)}` : "/records",
  );
  const year = dateKey ? Number(dateKey.slice(0, 4)) : new Date().getFullYear();
  const { data: yearRecords = [], isLoading, error } = useWorkoutListByYear(user ?? null, year);
  const dayWorkouts = useMemo(
    () => (dateKey ? workoutsOnDate(yearRecords, dateKey) : []),
    [yearRecords, dateKey],
  );
  const dayStats = useMemo(() => aggregateWorkouts(dayWorkouts), [dayWorkouts]);
  const title = dateKey ? formatRecordDate(dateKey, locale) : t.records_title;

  if (loading || !user) {
    return (
      <PageLayout title={t.records_title}>
        <LoadingCard />
      </PageLayout>
    );
  }

  return (
    <PageLayout title={t.records_title}>
      {error ? <Alert className="mb-4">{toDisplayError(error)}</Alert> : null}
      {!dateKey ? (
        <Card>
          <p className="text-sm text-zinc-500">{t.records_no_workout_day}</p>
        </Card>
      ) : (
        <>
          <section className="mb-4">
            <h2 className="mb-3 text-lg font-bold text-zinc-900">{title}</h2>
            {isLoading && yearRecords.length === 0 ? (
              <SkeletonLines count={4} />
            ) : (
              <WorkoutAggregateStats stats={dayStats} showWorkoutDays={false} />
            )}
          </section>

          {isLoading && yearRecords.length === 0 ? null : dayWorkouts.length === 0 ? (
            <Card>
              <p className="text-sm text-zinc-500">{t.records_no_workout_day}</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {dayWorkouts.map((workout) => (
                <WorkoutDayCard
                  key={workout.id}
                  workout={workout}
                  locale={locale}
                  unit={unit}
                  t={t}
                />
              ))}
            </div>
          )}
        </>
      )}
    </PageLayout>
  );
}
