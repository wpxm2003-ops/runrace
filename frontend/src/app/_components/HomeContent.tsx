"use client";

import { useMemo } from "react";
import Link from "next/link";
import { PageLayout } from "@/app/_components/PageLayout";
import { WelcomeOnboarding } from "@/app/_components/WelcomeOnboarding";
import { Card } from "@/app/_components/ui/Card";
import { EmptyState } from "@/app/_components/ui/EmptyState";
import { RaceCard } from "@/app/_components/ui/RaceCard";
import { SectionHeader } from "@/app/_components/ui/SectionHeader";
import {
  ActiveRaceFallback,
  HomeIcon,
  HomeToolTile,
  LinkAction,
  QuickAction,
  WeeklyActivityCard,
} from "@/app/_components/HomeWidgets";
import {
  useChallengeDetail,
  useMe,
  useMyChallengeListInfinite,
  useRivals,
  useWorkoutListByYear,
} from "@/lib/api";
import { challengeDetailHref } from "@/lib/challengeRoute";
import { isCrewAvailable } from "@/lib/crewAccess";
import {
  buildHomeRaceComparison,
  buildWeeklyActivity,
  weekDateKeys,
} from "@/lib/homeDashboard";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import { formatDistanceAmount, formatGoalDistance } from "@/lib/units";
import { useAuthUser } from "@/lib/useAuthUser";

export default function HomeContent() {
  const { t, locale } = useLocale();
  const { unit } = useUnit();
  const { user, loading: authLoading, hint } = useAuthUser();
  const today = useMemo(() => new Date(), []);
  const currentYear = today.getFullYear();
  const homeWeekKeys = useMemo(() => weekDateKeys(today), [today]);
  const needsPreviousYear = Number(homeWeekKeys[0].slice(0, 4)) < currentYear;

  const { data: yearRecords = [], isLoading: recordsLoading } = useWorkoutListByYear(user, currentYear);
  const { data: previousYearRecords = [], isLoading: previousRecordsLoading } = useWorkoutListByYear(
    needsPreviousYear ? user : null,
    currentYear - 1,
  );
  const { data: me } = useMe(user);
  const myRaces = useMyChallengeListInfinite(user, "in_progress");
  const activeRace = myRaces.data?.[0]?.items[0] ?? null;
  const { data: activeRaceDetail, isLoading: raceDetailLoading } = useChallengeDetail(activeRace?.id ?? null, user);
  const { data: rivals = [] } = useRivals(user);

  const allRelevantRecords = useMemo(
    () => needsPreviousYear ? [...previousYearRecords, ...yearRecords] : yearRecords,
    [needsPreviousYear, previousYearRecords, yearRecords],
  );
  const weekly = useMemo(
    () => buildWeeklyActivity(allRelevantRecords, today),
    [allRelevantRecords, today],
  );
  const raceComparison = useMemo(
    () => buildHomeRaceComparison(activeRaceDetail),
    [activeRaceDetail],
  );
  const dayLabels = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { weekday: "narrow" });
    return weekly.dayKeys.map((key) => formatter.format(new Date(`${key}T12:00:00`)));
  }, [locale, weekly.dayKeys]);

  const authRestoring = authLoading && Boolean(hint);
  const statsLoading = authRestoring || recordsLoading || (needsPreviousYear && previousRecordsLoading);
  const displayName = me?.nickname ?? user?.displayName ?? t.home_runner;
  const firstRival = rivals[0] ?? null;
  const rivalTotal = firstRival ? firstRival.wins + firstRival.losses : 0;
  const rivalWinRate = firstRival && rivalTotal > 0
    ? ((firstRival.wins / rivalTotal) * 100).toFixed(0)
    : "0";

  const quickActions = [
    { href: "/challenges", icon: "race" as const, label: t.home_quick_races },
    { href: "/training", icon: "training" as const, label: t.home_quick_training },
    { href: "/workout/indoor", icon: "indoor" as const, label: t.indoor_title },
    isCrewAvailable(locale)
      ? { href: "/crew", icon: "crew" as const, label: t.home_quick_crew }
      : { href: "/rivals", icon: "rival" as const, label: t.home_quick_rivals },
  ];

  return (
    <PageLayout className="pb-10">
      <WelcomeOnboarding />

      <section className="pb-5 pt-1">
        <p className="text-[13px] font-medium text-muted">{t.home_greeting(displayName)}</p>
        <h1 className="mt-2 max-w-sm text-balance text-[1.625rem] font-black leading-[1.32] tracking-[-0.045em] text-ink sm:text-[2rem]">
          {t.home_headline}
        </h1>
      </section>

      {user || authRestoring ? (
        <WeeklyActivityCard
          loading={statsLoading}
          distanceM={weekly.totalDistanceM}
          workoutCount={weekly.workoutCount}
          totalDurationSec={weekly.totalDurationSec}
          dailyDistanceM={weekly.dailyDistanceM}
          dayLabels={dayLabels}
        />
      ) : (
        <section className="rounded-hero bg-night p-card text-white shadow-float">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-brand">RunRace</div>
          <h2 className="mt-2 text-xl font-bold tracking-[-0.03em]">{t.home_guest_card_title}</h2>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/55">{t.home_guest_card_desc}</p>
          <LinkAction href="/login" className="mt-4">{t.header_login}</LinkAction>
        </section>
      )}

      <Link
        href="/workout"
        className="mt-4 flex h-button w-full items-center justify-between rounded-control bg-brand px-5 text-sm font-black text-night shadow-[0_8px_20px_rgb(255_90_22/0.22)] transition-colors hover:bg-brand-hover active:bg-brand-pressed"
      >
        <span className="flex items-center gap-2.5">
          <HomeIcon name="run" className="h-5 w-5" />
          {t.home_start_run}
        </span>
        <span className="text-lg" aria-hidden="true">→</span>
      </Link>

      <nav className="mt-6 grid grid-cols-4 gap-3" aria-label={t.home_quick_menu_label}>
        {quickActions.map((action) => (
          <QuickAction key={action.href} {...action} />
        ))}
      </nav>

      <section className="mt-9">
        <SectionHeader
          title={t.home_current_race}
          action={
            <Link href="/challenges" className="flex min-h-8 items-center text-xs font-semibold text-muted hover:text-ink">
              {t.home_all_races} <span className="ml-1" aria-hidden="true">›</span>
            </Link>
          }
        />

        <div className="mt-3">
          {myRaces.isLoading || (activeRace && raceDetailLoading) ? (
            <div className="h-52 animate-pulse rounded-hero bg-night" aria-label={t.loading} />
          ) : activeRace && raceComparison ? (
            <RaceCard
              href={challengeDetailHref(activeRace.id)}
              eyebrow={t.home_current_race}
              title={activeRace.title}
              statusLabel={t.races_filter_in_progress}
              runners={[
                {
                  label: t.home_me,
                  value: `${formatDistanceAmount(raceComparison.me.totalKm, unit)} ${unit}`,
                  progress: raceComparison.me.progressPercent,
                  isMe: true,
                },
                ...(raceComparison.opponent
                  ? [{
                    label: raceComparison.opponent.member.nickname ?? t.home_opponent,
                    value: `${formatDistanceAmount(raceComparison.opponent.totalKm, unit)} ${unit}`,
                    progress: raceComparison.opponent.progressPercent,
                  }]
                  : []),
              ]}
              progressLabel={(runnerLabel) => t.home_progress_label(runnerLabel)}
              meta={t.home_race_meta(formatGoalDistance(activeRace.goalKm, unit), raceComparison.memberCount)}
            />
          ) : activeRace ? (
            <ActiveRaceFallback
              href={challengeDetailHref(activeRace.id)}
              title={activeRace.title}
              goal={formatGoalDistance(activeRace.goalKm, unit)}
              members={t.home_people_count(activeRace.memberCount)}
            />
          ) : (
            <Card padding="p-4">
              <EmptyState
                icon={<HomeIcon name="race" />}
                title={t.home_no_active_race}
                description={t.home_no_active_race_desc}
                action={<LinkAction href="/challenges">{t.home_find_race}</LinkAction>}
              />
            </Card>
          )}
        </div>
      </section>

      {user ? (
        <section className="mt-9">
          <SectionHeader
            title={t.home_rivals_title}
            action={
              <Link href="/rivals" className="flex min-h-8 items-center text-xs font-semibold text-muted hover:text-ink">
                {t.home_manage_rivals} <span className="ml-1" aria-hidden="true">›</span>
              </Link>
            }
          />
          <Card padding="p-4" className="mt-3">
            {firstRival ? (
              <Link href="/rivals" className="flex min-h-14 items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-night text-sm font-black text-brand">
                  {(firstRival.nickname ?? "R").slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-ink">{firstRival.nickname ?? t.no_name}</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {t.home_rival_record(firstRival.wins, firstRival.losses)}
                  </span>
                </span>
                <span className="text-right">
                  <span className="rr-number block text-lg font-black text-brand">{rivalWinRate}%</span>
                  <span className="block text-[10px] text-muted">{t.home_win_rate}</span>
                </span>
              </Link>
            ) : (
              <EmptyState
                icon={<HomeIcon name="rival" />}
                title={t.home_rivals_empty}
                description={t.home_rivals_empty_desc}
                action={<LinkAction href="/rivals">{t.home_add_rival}</LinkAction>}
              />
            )}
          </Card>
        </section>
      ) : null}

      <section className="mt-9">
        <SectionHeader title={t.home_more_title} />
        <div className="mt-3 grid grid-cols-2 gap-3">
          <HomeToolTile href="/tools" icon="calculator" title={t.home_tools_card_title} />
          <HomeToolTile href="/guides" icon="guide" title={t.guide_list_title} />
        </div>
        <Link
          href="/feedback"
          className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-control text-xs font-semibold text-muted transition-colors hover:bg-panel-muted hover:text-ink"
        >
          <HomeIcon name="feedback" className="h-4 w-4" />
          {t.feedback_home_title}
        </Link>
      </section>
    </PageLayout>
  );
}
