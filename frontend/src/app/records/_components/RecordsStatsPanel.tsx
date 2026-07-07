"use client";

import type { WorkoutListItem } from "@/lib/api/types";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import { weekdayLabels, formatMonthDayTime } from "@/lib/format";
import { formatDistance, formatPace } from "@/lib/units";
import {
  aggregateWorkouts,
  computeStreak,
  longestStreak,
  dayOfWeekDistribution,
  monthBests,
  monthComparison,
} from "@/lib/workoutStats";
import { useMemo } from "react";
import { useNativeBack } from "@/lib/useNativeBack";
import { MonthlyRecapCard } from "@/app/records/_components/MonthlyRecapCard";

type Props = {
  monthItems: WorkoutListItem[];
  yearItems: WorkoutListItem[];
  prevYearItems: WorkoutListItem[];
  viewYear: number;
  viewMonth: number;
  today: Date;
  locale: string;
  onClose: () => void;
};

export function RecordsStatsPanel({
  monthItems,
  yearItems,
  prevYearItems,
  viewYear,
  viewMonth,
  today,
  locale,
  onClose,
}: Props) {
  const { t } = useLocale();
  const { unit } = useUnit();

  useNativeBack(onClose);

  const monthName = useMemo(
    () => new Date(viewYear, viewMonth, 1).toLocaleDateString(locale, { month: "long" }),
    [viewYear, viewMonth, locale],
  );

  const prevMonthName = useMemo(() => {
    const d = new Date(viewYear, viewMonth - 1, 1);
    return d.toLocaleDateString(locale, { month: "long" });
  }, [viewYear, viewMonth, locale]);

  const dowCounts = useMemo(() => dayOfWeekDistribution(monthItems), [monthItems]);
  const maxDow = Math.max(...dowCounts, 1);

  const cmp = useMemo(
    () => monthComparison(yearItems, prevYearItems, viewYear, viewMonth),
    [yearItems, prevYearItems, viewYear, viewMonth],
  );

  const streak = useMemo(() => computeStreak(yearItems, today), [yearItems, today]);
  const monthLongest = useMemo(() => longestStreak(monthItems), [monthItems]);

  const bests = useMemo(() => monthBests(monthItems), [monthItems]);
  const monthAgg = useMemo(() => aggregateWorkouts(monthItems), [monthItems]);
  const activeDays = useMemo(
    () => Array.from(new Set(monthItems.map((w) => new Date(w.startedAt).getDate()))),
    [monthItems],
  );
  // 결산 카드 캘린더용 — 일요일 시작 7개 요일 라벨
  const recapWeekdays = useMemo(() => weekdayLabels(locale), [locale]);
  // 월요일 시작(ISO) 요일 라벨
  const isoWeekdays = useMemo(() => weekdayLabels(locale, true), [locale]);

  const distDelta = cmp.thisDist - cmp.prevDist;
  const distPct = cmp.prevDist > 0 ? Math.round((Math.abs(distDelta) / cmp.prevDist) * 100) : 0;
  const countDelta = cmp.thisCount - cmp.prevCount;
  const countPct = cmp.prevCount > 0 ? Math.round((Math.abs(countDelta) / cmp.prevCount) * 100) : 0;
  const noPrevDist = cmp.prevDist === 0;
  const noPrevCount = cmp.prevCount === 0;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} aria-hidden="true" />

      <div className="fixed inset-x-0 bottom-0 z-50 max-h-[88dvh] overflow-y-auto rounded-t-3xl bg-zinc-50 shadow-2xl">
        {/* 핸들 + 헤더 */}
        <div className="sticky top-0 z-10 rounded-t-3xl bg-zinc-50 px-5 pb-3 pt-3">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-300" />
          <div className="flex items-center justify-between gap-2">
            <h2 className="min-w-0 truncate text-lg font-bold text-zinc-900">{t.stats_title(monthName)}</h2>
            <div className="flex shrink-0 items-center gap-2">
              {monthAgg.workoutCount > 0 ? (
                <MonthlyRecapCard
                  monthName={monthName}
                  year={viewYear}
                  month={viewMonth}
                  activeDays={activeDays}
                  weekdayLabels={recapWeekdays}
                  distanceM={monthAgg.totalDistanceM}
                  runCount={monthAgg.workoutCount}
                  durationSec={monthAgg.totalDurationSec}
                  longestStreak={monthLongest}
                  unit={unit}
                  t={t}
                />
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-200 text-sm text-zinc-500 hover:bg-zinc-300"
                aria-label={t.close}
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-3 px-4 pb-10 pt-1">

          {/* 1. 요일 패턴 */}
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-400">
              {t.stats_day_pattern}
            </p>
            <div className="space-y-2">
              {isoWeekdays.map((day, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <span className="w-4 shrink-0 text-right text-xs font-medium text-zinc-500">{day}</span>
                  <div className="relative flex-1 overflow-hidden rounded-full bg-zinc-100" style={{ height: 10 }}>
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-zinc-800 transition-all"
                      style={{ width: `${(dowCounts[i] / maxDow) * 100}%` }}
                    />
                  </div>
                  <span className="w-7 shrink-0 text-right text-xs font-semibold tabular-nums text-zinc-700">
                    {dowCounts[i] > 0 ? t.stats_count_unit(dowCounts[i]) : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 2. 이번 달 vs 지난 달 */}
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-400">
              {t.stats_month_compare}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <CompareCard
                label={t.stat_distance}
                prev={formatDistance(cmp.prevDist, unit)}
                curr={formatDistance(cmp.thisDist, unit)}
                prevLabel={prevMonthName}
                currLabel={monthName}
                delta={distDelta}
                pct={distPct}
                noPrev={noPrevDist}
                noPrevLabel={t.stats_no_prev}
              />
              <CompareCard
                label={t.stats_count_label}
                prev={t.stats_count_unit(cmp.prevCount)}
                curr={t.stats_count_unit(cmp.thisCount)}
                prevLabel={prevMonthName}
                currLabel={monthName}
                delta={countDelta}
                pct={countPct}
                noPrev={noPrevCount}
                noPrevLabel={t.stats_no_prev}
              />
            </div>
          </div>

          {/* 3. 연속 운동 */}
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-400">
              {t.stats_streak_section}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-zinc-900 px-4 py-3">
                <p className="text-xs font-medium text-zinc-400">{t.stats_streak_current}</p>
                <p className="mt-1 text-3xl font-bold tabular-nums text-white">
                  {streak.current}
                  <span className="ml-1 text-sm font-semibold text-zinc-400">{t.stat_days_unit}</span>
                </p>
              </div>
              <div className="rounded-xl bg-zinc-100 px-4 py-3">
                <p className="text-xs font-medium text-zinc-500">{t.stats_streak_longest}</p>
                <p className="mt-1 text-3xl font-bold tabular-nums text-zinc-800">
                  {monthLongest}
                  <span className="ml-1 text-sm font-semibold text-zinc-400">{t.stat_days_unit}</span>
                </p>
              </div>
            </div>
          </div>

          {/* 4. 이달 최고 기록 */}
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-400">
              {t.stats_bests_section}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <BestCard
                label={t.stats_best_distance}
                value={bests.longestRun ? formatDistance(bests.longestRun.distanceM, unit) : null}
                datetime={bests.longestRun ? formatMonthDayTime(bests.longestRun.startedAt, locale) : null}
                noData={t.stats_no_data}
              />
              <BestCard
                label={t.stats_best_pace}
                value={bests.fastestPace?.avgPaceSecPerKm
                  ? formatPace(1000, bests.fastestPace.avgPaceSecPerKm, unit)
                  : null}
                datetime={bests.fastestPace ? formatMonthDayTime(bests.fastestPace.startedAt, locale) : null}
                noData={t.stats_no_data}
              />
            </div>
          </div>

        </div>
      </div>
    </>
  );
}

function CompareCard({
  label,
  prev,
  curr,
  prevLabel,
  currLabel,
  delta,
  pct,
  noPrev,
  noPrevLabel,
}: {
  label: string;
  prev: string;
  curr: string;
  prevLabel: string;
  currLabel: string;
  delta: number;
  pct: number;
  noPrev: boolean;
  noPrevLabel: string;
}) {
  const positive = delta > 0;
  const neutral = delta === 0;
  return (
    <div className="rounded-xl bg-zinc-50 p-3">
      <p className="mb-2 text-xs font-medium text-zinc-500">{label}</p>
      <div className="space-y-1.5">
        <div>
          <p className="text-[10px] text-zinc-400">{prevLabel}</p>
          <p className="text-sm text-zinc-500">{prev}</p>
        </div>
        <div>
          <p className="text-[10px] text-zinc-400">{currLabel}</p>
          <p className="text-base font-bold text-zinc-900">{curr}</p>
        </div>
      </div>
      {noPrev ? (
        <p className="mt-2 text-[11px] text-zinc-400">{noPrevLabel}</p>
      ) : !neutral ? (
        <span
          className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            positive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
          }`}
        >
          {positive ? "+" : "-"}{pct}%
        </span>
      ) : null}
    </div>
  );
}

function BestCard({
  label,
  value,
  datetime,
  noData,
}: {
  label: string;
  value: string | null;
  datetime: string | null;
  noData: string;
}) {
  return (
    <div className="rounded-xl bg-zinc-50 p-3">
      <p className="mb-2 text-xs font-medium text-zinc-500">{label}</p>
      {value ? (
        <>
          <p className="text-xl font-bold text-zinc-900">{value}</p>
          <p className="mt-1 text-[11px] leading-snug text-zinc-400">{datetime}</p>
        </>
      ) : (
        <p className="text-sm text-zinc-400">{noData}</p>
      )}
    </div>
  );
}
