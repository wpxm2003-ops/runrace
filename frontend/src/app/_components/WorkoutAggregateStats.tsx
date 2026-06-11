"use client";

import { StatCard } from "@/app/_components/ui/StatCard";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import { formatDistance, formatPace } from "@/lib/units";
import type { WorkoutAggregate } from "@/lib/workoutStats";
import { formatDuration } from "@/lib/workoutTrack";

type Props = {
  stats: WorkoutAggregate;
  /** true면 총 운동일 카드 포함 (내정보 전체) */
  showWorkoutDays?: boolean;
  /** true면 총 거리·총 시간 등 전체 요약 라벨 (내정보) */
  totalLabels?: boolean;
};

export function WorkoutAggregateStats({
  stats,
  showWorkoutDays = false,
  totalLabels = false,
}: Props) {
  const { t } = useLocale();
  const { unit } = useUnit();
  const paceLabel = formatPace(
    stats.totalDistanceM,
    stats.totalDurationSec,
    unit,
  );

  const cards = [
    {
      label: totalLabels ? t.stat_total_distance : t.stat_distance,
      value: formatDistance(stats.totalDistanceM, unit),
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
