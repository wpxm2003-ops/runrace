"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PageLayout } from "@/app/_components/PageLayout";
import { WorkoutAggregateStats } from "@/app/_components/WorkoutAggregateStats";
import { WorkoutRecordPanel } from "@/app/_components/WorkoutRecordPanel";
import { Alert } from "@/app/_components/ui/Alert";
import { Card } from "@/app/_components/ui/Card";
import { SkeletonLines } from "@/app/_components/ui/Skeleton";
import { useWorkoutListByYear } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useLocale } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/useRequireAuth";
import {
  aggregateWorkouts,
  buildCalendarCells,
  filterWorkoutsByMonth,
  formatMonthLabel,
  localDateKey,
  workoutDateKeys,
  workoutsOnDate,
} from "@/lib/workoutStats";

export default function RecordsPage() {
  const { user, loading } = useRequireAuth("/records");
  const { t, locale } = useLocale();
  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<number | null>(null);
  const detailSectionRef = useRef<HTMLElement>(null);

  const { data: yearRecords = [], isLoading, error } = useWorkoutListByYear(
    user,
    viewYear,
  );

  const monthItems = useMemo(
    () => filterWorkoutsByMonth(yearRecords, viewYear, viewMonth),
    [yearRecords, viewYear, viewMonth],
  );

  const monthStats = useMemo(() => aggregateWorkouts(monthItems), [monthItems]);
  const monthName = useMemo(
    () => new Date(viewYear, viewMonth, 1).toLocaleDateString(locale, { month: "long" }),
    [viewYear, viewMonth, locale],
  );
  const monthSummaryTitle = t.records_month_summary(monthName);
  const activeDateKeys = useMemo(() => workoutDateKeys(monthItems), [monthItems]);
  const calendarCells = useMemo(
    () => buildCalendarCells(viewYear, viewMonth),
    [viewYear, viewMonth],
  );

  const dayWorkouts = useMemo(() => {
    if (!selectedDateKey) return [];
    return workoutsOnDate(monthItems, selectedDateKey);
  }, [monthItems, selectedDateKey]);

  // 2023-01-01은 일요일 → 일요일 시작 7칸을 현재 언어로 자동 생성
  const weekdays = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: "short" });
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2023, 0, 1 + i)));
  }, [locale]);

  function shiftMonth(delta: number) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setSelectedDateKey(null);
    setSelectedWorkoutId(null);
  }

  function selectDay(dateKey: string) {
    const list = workoutsOnDate(monthItems, dateKey);
    setSelectedDateKey(dateKey);
    setSelectedWorkoutId(list[0]?.id ?? null);
  }

  useEffect(() => {
    if (!selectedDateKey) return;
    const list = workoutsOnDate(monthItems, selectedDateKey);
    if (list.length === 0) {
      setSelectedDateKey(null);
      setSelectedWorkoutId(null);
      return;
    }
    setSelectedWorkoutId((current) => {
      if (current != null && list.some((w) => w.id === current)) return current;
      return list[0].id;
    });
  }, [monthItems, selectedDateKey]);

  useEffect(() => {
    if (!selectedDateKey || selectedWorkoutId == null) return;
    const el = detailSectionRef.current;
    if (!el) return;
    const id = window.requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "end" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [selectedDateKey, selectedWorkoutId]);

  if (loading || !user) {
    return (
      <PageLayout title={t.records_title}>
        <Card className="text-sm text-zinc-600">{t.loading}</Card>
      </PageLayout>
    );
  }

  return (
    <PageLayout title={t.records_title}>
      {error ? <Alert className="mb-4">{String(error)}</Alert> : null}

      <div className="mb-5 flex min-h-14 items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-zinc-200 text-2xl leading-none text-zinc-700 hover:bg-zinc-50"
          aria-label={t.records_prev_month}
        >
          ‹
        </button>
        <div className="min-w-0 flex-1 px-1 text-center text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
          {formatMonthLabel(viewYear, viewMonth, locale)}
        </div>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-zinc-200 text-2xl leading-none text-zinc-700 hover:bg-zinc-50"
          aria-label={t.records_next_month}
        >
          ›
        </button>
      </div>

      <section className="mb-4">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">
          {monthSummaryTitle}
        </h2>
        {isLoading && yearRecords.length === 0 ? (
          <SkeletonLines count={4} />
        ) : (
          <WorkoutAggregateStats stats={monthStats} showWorkoutDays={false} />
        )}
      </section>

      <Card>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-zinc-500">
          {weekdays.map((w) => (
            <div key={w} className="py-1 font-medium">
              {w}
            </div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {calendarCells.map((cell, i) => {
            if (cell.day == null || !cell.dateKey) {
              return <div key={`empty-${i}`} className="aspect-square" />;
            }
            const hasWorkout = activeDateKeys.has(cell.dateKey);
            const isSelected = selectedDateKey === cell.dateKey;
            const isToday = cell.dateKey === localDateKey(today.toISOString());

            return (
              <button
                key={cell.dateKey}
                type="button"
                disabled={!hasWorkout}
                onClick={() => cell.dateKey && selectDay(cell.dateKey)}
                className={`aspect-square rounded-lg text-sm tabular-nums transition-colors ${
                  hasWorkout
                    ? "font-bold text-zinc-900 hover:bg-zinc-100"
                    : "font-normal text-zinc-400"
                } ${
                  isSelected
                    ? "bg-zinc-100 font-bold text-zinc-900 ring-2 ring-zinc-900 ring-offset-1"
                    : ""
                } ${isToday && !isSelected ? "ring-1 ring-zinc-300" : ""} disabled:cursor-default disabled:opacity-40`}
              >
                {cell.day}
              </button>
            );
          })}
        </div>
      </Card>

      <section ref={detailSectionRef} className="mt-4 scroll-mt-4">
        {!selectedDateKey ? (
          <p className="text-center text-sm text-zinc-500">{t.records_select_day}</p>
        ) : dayWorkouts.length === 0 ? (
          <p className="text-center text-sm text-zinc-500">{t.records_no_workout_day}</p>
        ) : (
          <>
            {dayWorkouts.length > 1 ? (
              <div
                className={`mb-3 grid w-full gap-2 ${
                  dayWorkouts.length === 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"
                }`}
              >
                {dayWorkouts.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => setSelectedWorkoutId(w.id)}
                    className={`min-w-0 rounded-xl border px-2 py-2 text-center text-xs tabular-nums ${
                      selectedWorkoutId === w.id
                        ? "border-zinc-900 bg-zinc-100 font-semibold text-zinc-900 ring-1 ring-zinc-900"
                        : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                    }`}
                  >
                    <span className="block truncate">{formatDateTime(w.startedAt)}</span>
                  </button>
                ))}
              </div>
            ) : null}
            {selectedWorkoutId != null ? (
              <WorkoutRecordPanel
                workoutId={selectedWorkoutId}
                user={user}
                viewYear={viewYear}
                onDeleted={() => {
                  setSelectedDateKey(null);
                  setSelectedWorkoutId(null);
                }}
              />
            ) : null}
          </>
        )}
      </section>
    </PageLayout>
  );
}
