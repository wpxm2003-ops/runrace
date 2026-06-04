"use client";

import { formatKm } from "@/lib/format";
import { useLocale } from "@/lib/i18n";
import type { WorkoutAggregate } from "@/lib/workoutStats";
import { formatDuration, formatPaceMinPerKm } from "@/lib/workoutTrack";

type Props = {
  stats: WorkoutAggregate;
  /** true면 총 운동일 카드 포함 (내정보 전체) */
  showWorkoutDays?: boolean;
  /** true면 총 거리·총 시간 등 전체 요약 라벨 (내정보) */
  totalLabels?: boolean;
};

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums sm:text-xl">{value}</div>
    </div>
  );
}

export function WorkoutAggregateStats({
  stats,
  showWorkoutDays = false,
  totalLabels = false,
}: Props) {
  const { t } = useLocale();
  const paceLabel = formatPaceMinPerKm(
    stats.totalDistanceM,
    stats.totalDurationSec,
  );

  const cards = [
    {
      label: totalLabels ? t.stat_total_distance : t.stat_distance,
      value: formatKm(stats.totalDistanceM),
    },
    {
      label: totalLabels ? t.stat_total_time : t.stat_time,
      value: formatDuration(stats.totalDurationSec),
    },
    {
      label: totalLabels ? t.stat_avg_pace : t.stat_pace,
      value: paceLabel,
    },
    ...(showWorkoutDays
      ? [{ label: t.stat_total_days, value: `${stats.workoutDayCount}${t.stat_days_unit}` }]
      : []),
    {
      label: totalLabels ? t.stat_total_calories : t.stat_calories,
      value: `${stats.totalCalories} kcal`,
    },
  ];

  return (
    <div
      className={`grid gap-3 ${showWorkoutDays ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-4"}`}
    >
      {cards.map((c) => (
        <StatCard key={c.label} label={c.label} value={c.value} />
      ))}
    </div>
  );
}
