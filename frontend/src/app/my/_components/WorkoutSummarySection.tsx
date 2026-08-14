"use client";

import type { User } from "firebase/auth";
import { Alert } from "@/app/_components/ui/Alert";
import { AsyncList } from "@/app/_components/ui/AsyncList";
import { PersonalBestsSection } from "@/app/my/_components/PersonalBestsSection";
import { useWorkoutSummary } from "@/lib/api";
import type { WorkoutSummary } from "@/lib/api/types";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import { formatDistance, formatPace } from "@/lib/units";
import { formatClock } from "@/lib/workoutTrack";

type SummaryIconName = "distance" | "time" | "pace" | "days" | "calories" | "streak";

function SummaryIcon({ name }: { name: SummaryIconName }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-5 w-5",
    "aria-hidden": true,
  };

  switch (name) {
    case "distance":
      return <svg {...common}><path d="M6 21 9 3M18 21 15 3M12 5v3M12 11v3M12 17v3" /></svg>;
    case "time":
      return <svg {...common}><circle cx="12" cy="13" r="8" /><path d="M12 9v4l3 2M9 2h6M12 2v3" /></svg>;
    case "pace":
      return <svg {...common}><path d="M4 17a8 8 0 1 1 16 0M12 17l4-5" /><path d="M7 17h10" /></svg>;
    case "days":
      return <svg {...common}><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16M8 14h2M14 14h2" /></svg>;
    case "calories":
      return <svg {...common}><path d="M13 3c1 4-2 5-2 8 0 1.7 1.3 2.8 2.8 2.8 2.4 0 3.7-2.2 3.2-4.8 2 2 3 4.1 3 6.2A8 8 0 0 1 4 15c0-4.2 2.4-7.7 6.2-10-.4 2.7.6 4.2 2.8 5" /></svg>;
    case "streak":
      return <svg {...common}><path d="M8 4h8v4a4 4 0 0 1-8 0V4ZM8 6H5v2a3 3 0 0 0 3 3M16 6h3v2a3 3 0 0 1-3 3M12 12v4M8 20h8M10 16h4v4" /></svg>;
  }
}

function SummaryStatCard({ icon, label, value }: { icon: SummaryIconName; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-card border border-line bg-panel p-4 shadow-card">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
          <SummaryIcon name={icon} />
        </span>
        <span className="min-w-0 text-[13px] font-semibold leading-tight text-muted">{label}</span>
      </div>
      <div className="rr-number mt-3 truncate text-[1.05rem] font-black tracking-[-0.035em] text-ink sm:text-lg">
        {value}
      </div>
    </div>
  );
}

function SummaryGrid({ summary }: { summary: WorkoutSummary }) {
  const { t } = useLocale();
  const { unit } = useUnit();
  const stats: Array<{ icon: SummaryIconName; label: string; value: string }> = [
    { icon: "distance", label: t.stat_total_distance, value: formatDistance(summary.totalDistanceM, unit) },
    { icon: "time", label: t.stat_total_time, value: formatClock(summary.totalDurationSec) },
    { icon: "pace", label: t.stat_avg_pace, value: formatPace(summary.totalDistanceM, summary.totalDurationSec, unit) },
    { icon: "days", label: t.stat_total_days, value: `${summary.workoutDayCount}${t.stat_days_unit}` },
    { icon: "calories", label: t.stat_total_calories, value: `${summary.totalCalories} kcal` },
    { icon: "streak", label: t.stat_max_streak, value: `${summary.maxStreakDays}${t.stat_days_unit}` },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {stats.map((stat) => <SummaryStatCard key={stat.label} {...stat} />)}
    </div>
  );
}

export function WorkoutSummarySection({ user }: { user: User }) {
  const { t } = useLocale();
  const { data: summary, isLoading: summaryLoading, error: summaryError } = useWorkoutSummary(user);

  return (
    <section className="mt-9">
      <h2 className="text-lg font-bold tracking-[-0.025em] text-ink">
        {t.my_records_all_time}
      </h2>
      {summaryError ? <Alert className="mt-3">{String(summaryError)}</Alert> : null}
      <div className="mt-3">
        <AsyncList
          isLoading={summaryLoading}
          data={summary}
          isEmpty={(data) => data.workoutCount === 0}
          emptyMessage={t.my_records_empty}
          skeletonCount={3}
        >
          {(data) => (
            <>
              <SummaryGrid summary={data} />
              <PersonalBestsSection user={user} />
            </>
          )}
        </AsyncList>
      </div>
    </section>
  );
}
