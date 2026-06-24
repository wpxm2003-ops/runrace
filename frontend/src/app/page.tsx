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

function HomeStats() {
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
          <p className="text-xs text-zinc-500">이번 달</p>
          {isLoading ? (
            <div className="mt-2 h-7 w-20 animate-pulse rounded-lg bg-zinc-100" />
          ) : isEmpty ? (
            <p className="mt-2 text-sm text-zinc-400">아직 기록이 없어요</p>
          ) : (
            <>
              <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-900">
                {formatDistance(monthStats.totalDistanceM, unit)}
              </p>
              <p className="mt-0.5 text-xs text-zinc-400">{monthStats.workoutCount}회 운동</p>
            </>
          )}
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-xs text-zinc-500">연속 운동</p>
          {isLoading ? (
            <div className="mt-2 h-7 w-16 animate-pulse rounded-lg bg-zinc-100" />
          ) : isEmpty ? (
            <p className="mt-2 text-sm text-zinc-400">우리 같이 만들어 가볼까요?</p>
          ) : (
            <>
              <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-900">
                {streak.current}
                <span className="ml-1 text-sm font-semibold text-zinc-400">일</span>
              </p>
              <p className="mt-0.5 text-xs text-zinc-400">최장 {streak.longest}일</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const { t } = useLocale();

  return (
    <PageLayout>
      <WelcomeOnboarding />
      <div className="mt-2">
        <HomeStats />
        <div className="grid gap-3">
          <Link href="/workout/indoor" className="rounded-2xl bg-zinc-900 p-5 shadow-sm hover:bg-zinc-800">
            <div className="text-base font-semibold text-white">{t.indoor_title}</div>
            <div className="mt-1 text-sm text-zinc-400">{t.indoor_subtitle}</div>
          </Link>
          <Link href="/guides" className="rounded-2xl bg-white p-5 shadow-sm hover:bg-zinc-50">
            <div className="text-base font-semibold">{t.guide_list_title}</div>
            <div className="mt-1 text-sm text-zinc-600">{t.home_guide_card_desc}</div>
          </Link>
        </div>
      </div>
    </PageLayout>
  );
}
