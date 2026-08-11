"use client";

import { useMemo } from "react";
import Link from "next/link";
import { PageLayout } from "@/app/_components/PageLayout";
import { useLocale } from "@/lib/i18n";
import { useAuthUser } from "@/lib/useAuthUser";
import { useWorkoutListByYear } from "@/lib/api";
import { aggregateWorkouts, filterWorkoutsByMonth, computeStreak } from "@/lib/workoutStats";
import { useUnit } from "@/lib/UnitContext";
import { formatDistance } from "@/lib/units";
import { WelcomeOnboarding } from "@/app/_components/WelcomeOnboarding";

function HomeMenuItem({
  href,
  icon,
  title,
  badge,
  subtitle,
}: {
  href: string;
  icon: string;
  title: string;
  badge?: string;
  subtitle?: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm transition hover:bg-zinc-50"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-base">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-zinc-900">
          {title}
          {badge ? (
            <span className="ml-1 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
              {badge}
            </span>
          ) : null}
        </span>
        {subtitle ? (
          <span className="mt-0.5 block text-xs text-zinc-500">{subtitle}</span>
        ) : null}
      </span>
      <span className="text-lg leading-none text-zinc-300" aria-hidden="true">›</span>
    </Link>
  );
}

function HomeStats() {
  const { t } = useLocale();
  const { user, loading: authLoading, hint } = useAuthUser();
  const { unit } = useUnit();
  const today = useMemo(() => new Date(), []);
  const { data: yearRecords, isLoading: dataLoading } = useWorkoutListByYear(user ?? null, today.getFullYear());

  const monthStats = useMemo(
    () => aggregateWorkouts(filterWorkoutsByMonth(yearRecords ?? [], today.getFullYear(), today.getMonth())),
    [yearRecords, today],
  );
  const streak = useMemo(() => computeStreak(yearRecords ?? [], today), [yearRecords, today]);

  if (!user && !hint) return null;

  const isLoading = authLoading || dataLoading;
  const isEmpty = !isLoading && (yearRecords ?? []).length === 0;

  return (
    <div className="mb-6">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-xs text-zinc-500">{t.home_month_label}</p>
          {isLoading ? (
            <div className="mt-2 h-7 w-20 animate-pulse rounded-lg bg-zinc-100" />
          ) : isEmpty ? (
            <p className="mt-2 text-sm text-zinc-400">{t.home_stats_empty}</p>
          ) : (
            <>
              <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-900">
                {formatDistance(monthStats.totalDistanceM, unit)}
              </p>
              <p className="mt-0.5 text-xs text-zinc-400">
                {t.home_month_runs(monthStats.workoutCount)}
              </p>
            </>
          )}
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-xs text-zinc-500">{t.home_streak_label}</p>
          {isLoading ? (
            <div className="mt-2 h-7 w-16 animate-pulse rounded-lg bg-zinc-100" />
          ) : isEmpty ? (
            <p className="mt-2 text-sm text-zinc-400">{t.home_streak_empty}</p>
          ) : (
            <>
              <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-900">
                {streak.current}
                <span className="ml-1 text-sm font-semibold text-zinc-400">
                  {t.home_streak_unit(streak.current)}
                </span>
              </p>
              <p className="mt-0.5 text-xs text-zinc-400">
                {t.home_streak_longest(streak.longest)}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function HomeContent() {
  const { t } = useLocale();

  return (
    <PageLayout>
      <WelcomeOnboarding />
      <div className="mt-2">
        <HomeStats />
        <div className="grid gap-2">
          <HomeMenuItem href="/workout/indoor" icon="🏃‍♂️" title={t.indoor_title} subtitle={t.indoor_subtitle} />
          <HomeMenuItem href="/crew" icon="🔥" title={t.crew_title} badge="beta" />
          <HomeMenuItem href="/training" icon="🎯" title={t.nsm_title} badge="beta" />
          <HomeMenuItem href="/tools" icon="🧮" title={t.home_tools_card_title} />
          <HomeMenuItem href="/guides" icon="📖" title={t.guide_list_title} />
          <HomeMenuItem href="/feedback" icon="📢" title={t.feedback_home_title} />
        </div>
      </div>
    </PageLayout>
  );
}
