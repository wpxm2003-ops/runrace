"use client";

import { useEffect, useMemo, useState } from "react";
import { PageLayout } from "@/app/_components/PageLayout";
import { WorkoutAggregateStats } from "@/app/_components/WorkoutAggregateStats";
import { RecordsStatsPanel } from "@/app/records/_components/RecordsStatsPanel";
import { WorkoutCalendar } from "@/app/records/_components/WorkoutCalendar";
import { Alert } from "@/app/_components/ui/Alert";
import { LoadingCard } from "@/app/_components/ui/LoadingCard";
import { SkeletonLines } from "@/app/_components/ui/Skeleton";
import { useWorkoutListByYear, toDisplayError } from "@/lib/api";
import { track } from "@/lib/analytics";
import { weekdayLabels } from "@/lib/format";
import { useLocale } from "@/lib/i18n";
import { nativeNavigate } from "@/lib/nativeNav";
import { recordsDayHref } from "@/lib/recordsRoute";
import { useRequireAuth } from "@/lib/useRequireAuth";
import {
  aggregateWorkouts,
  buildCalendarCells,
  filterWorkoutsByMonth,
  formatMonthLabel,
  workoutDateKeys,
  workoutsOnDate,
} from "@/lib/workoutStats";
import { savePageState, loadPageState, usePageScrollRestore } from "@/lib/pageStateStore";

const STORE_KEY = "page:records";

export default function RecordsPage() {
  const { user, loading } = useRequireAuth("/records");
  const { t, locale } = useLocale();
  const today = useMemo(() => new Date(), []);

  // ── 캘린더 상태: 이전 방문 값 복원 ──────────────────────────────────
  const [viewYear, setViewYear] = useState(() => {
    return loadPageState(STORE_KEY).viewYear ?? today.getFullYear();
  });
  const [viewMonth, setViewMonth] = useState(() => {
    return loadPageState(STORE_KEY).viewMonth ?? today.getMonth();
  });
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(() => {
    return loadPageState(STORE_KEY).selectedDateKey ?? null;
  });
  const [statsOpen, setStatsOpen] = useState(false);

  const { data: yearRecords = [], isLoading, error } = useWorkoutListByYear(
    user,
    viewYear,
  );
  const { data: prevYearRecords = [] } = useWorkoutListByYear(
    viewMonth === 0 ? user : null,
    viewYear - 1,
  );

  usePageScrollRestore(STORE_KEY, yearRecords.length);

  // ── 상태 변경 시 저장 ────────────────────────────────────────────────
  useEffect(() => {
    savePageState(STORE_KEY, { viewYear, viewMonth, selectedDateKey });
  }, [viewYear, viewMonth, selectedDateKey]);

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


  // 일요일 시작 7칸 요일 라벨(현재 언어)
  const weekdays = useMemo(() => weekdayLabels(locale), [locale]);

  function shiftMonth(delta: number) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setSelectedDateKey(null);
  }

  function selectDay(dateKey: string) {
    const dayWorkouts = workoutsOnDate(monthItems, dateKey);
    setSelectedDateKey(dateKey);
    if (dayWorkouts.length === 1) {
      nativeNavigate(`/workouts/${dayWorkouts[0].id}`);
      return;
    }
    nativeNavigate(recordsDayHref(dateKey));
  }

  if (loading || !user) {
    return (
      <PageLayout title={t.records_title}>
        <LoadingCard />
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title={t.records_title}
      actions={
        <button
          type="button"
          onClick={() => { setStatsOpen(true); void track("weekly_report_view"); }}
          className="flex h-9 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 shrink-0">
            <path d="M18 20V10M12 20V4M6 20v-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t.stats_btn}
        </button>
      }
    >
      {error ? <Alert className="mb-4">{toDisplayError(error)}</Alert> : null}

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

      <WorkoutCalendar
        weekdays={weekdays}
        calendarCells={calendarCells}
        activeDateKeys={activeDateKeys}
        selectedDateKey={selectedDateKey}
        today={today}
        onSelectDay={selectDay}
      />

      {statsOpen ? (
        <RecordsStatsPanel
          monthItems={monthItems}
          yearItems={yearRecords}
          prevYearItems={prevYearRecords}
          viewYear={viewYear}
          viewMonth={viewMonth}
          today={today}
          locale={locale}
          onClose={() => setStatsOpen(false)}
        />
      ) : null}
    </PageLayout>
  );
}
