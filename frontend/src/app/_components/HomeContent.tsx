"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { PageLayout } from "@/app/_components/PageLayout";
import { WelcomeOnboarding } from "@/app/_components/WelcomeOnboarding";
import { Card } from "@/app/_components/ui/Card";
import { EmptyState } from "@/app/_components/ui/EmptyState";
import { RaceCard } from "@/app/_components/ui/RaceCard";
import { SectionHeader } from "@/app/_components/ui/SectionHeader";
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
import {
  formatDistance,
  formatDistanceAmount,
  formatGoalDistance,
  formatPace,
} from "@/lib/units";
import { useAuthUser } from "@/lib/useAuthUser";

type HomeIconName =
  | "run"
  | "race"
  | "training"
  | "records"
  | "crew"
  | "rival"
  | "indoor"
  | "calculator"
  | "guide"
  | "feedback";

function HomeIcon({ name, className = "h-5 w-5" }: { name: HomeIconName; className?: string }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };

  switch (name) {
    case "run":
      return (
        <svg {...common}>
          <circle cx="14.5" cy="4.5" r="2" />
          <path d="m12 9 3-2 2.5 3H21M12 9l-2 4 3 2.5M10 13l-4 1.5M13 15.5 10.5 21M7 9.5l3-2 2 1.5" />
        </svg>
      );
    case "race":
      return (
        <svg {...common}>
          <path d="M5 4v17M6 5h11l-2 3 2 3H6" />
        </svg>
      );
    case "training":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="4" />
          <path d="m12 12 7-7M16 5h3v3" />
        </svg>
      );
    case "records":
      return (
        <svg {...common}>
          <path d="M5 20V11M12 20V4M19 20v-6" />
        </svg>
      );
    case "crew":
    case "rival":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" />
          <circle cx="17" cy="9" r="2.5" />
          <path d="M3.5 20c0-3.4 2.4-6 5.5-6s5.5 2.6 5.5 6M14 15c3.4-.8 6.5 1.2 6.5 5" />
        </svg>
      );
    case "indoor":
      return (
        <svg {...common}>
          <path d="M4 19h16M6 16h11l2-6H9M8 10l2-4h6M9 16l-1 3M17 16l1 3" />
        </svg>
      );
    case "calculator":
      return (
        <svg {...common}>
          <rect x="5" y="3" width="14" height="18" rx="2" />
          <path d="M8 7h8M8 12h1M12 12h1M16 12h1M8 16h1M12 16h1M16 16h1" />
        </svg>
      );
    case "guide":
      return (
        <svg {...common}>
          <path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H12v18H7.5A3.5 3.5 0 0 0 4 23V5.5ZM20 5.5A3.5 3.5 0 0 0 16.5 2H12v18h4.5A3.5 3.5 0 0 1 20 23V5.5Z" />
        </svg>
      );
    case "feedback":
      return (
        <svg {...common}>
          <path d="M4 14V9l12-4v13L4 14Z" />
          <path d="M7 15.5 8.5 21h3L10 16.5M19 8v7" />
        </svg>
      );
  }
}

function distanceParts(distanceM: number, unit: "km" | "mi") {
  const [rawValue, label] = formatDistance(distanceM, unit).split(" ");
  return { value: Number(rawValue).toFixed(1), label };
}

const HOME_CHART_DISTANCE_STEP_M = 500;

function chartDistanceSteps(distanceM: number) {
  if (distanceM <= 0) return 0;
  return Math.max(1, Math.floor(distanceM / HOME_CHART_DISTANCE_STEP_M));
}

function WeeklyActivityCard({
  loading,
  distanceM,
  workoutCount,
  totalDurationSec,
  dailyDistanceM,
  dayLabels,
}: {
  loading: boolean;
  distanceM: number;
  workoutCount: number;
  totalDurationSec: number;
  dailyDistanceM: number[];
  dayLabels: string[];
}) {
  const { t } = useLocale();
  const { unit } = useUnit();
  const distance = distanceParts(distanceM, unit);
  const dailyDistanceSteps = dailyDistanceM.map(chartDistanceSteps);
  const maxDistanceSteps = Math.max(...dailyDistanceSteps, 1);
  const pace = formatPace(distanceM, totalDurationSec, unit);

  return (
    <section className="relative overflow-hidden rounded-hero bg-night p-card text-white shadow-float">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-white/60">{t.home_week_label}</span>
        <Link href="/records" className="flex min-h-8 items-center text-xs font-medium text-white/55 hover:text-white">
          {t.home_view_details}
          <span className="ml-1" aria-hidden="true">›</span>
        </Link>
      </div>

      {loading ? (
        <div className="mt-4 space-y-4" aria-label={t.loading}>
          <div className="h-10 w-36 animate-pulse rounded-xl bg-white/10" />
          <div className="h-20 animate-pulse rounded-xl bg-white/10" />
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_8.75rem] gap-4 sm:grid-cols-[minmax(0,1fr)_11rem]">
          <div className="min-w-0">
            <div className="rr-number whitespace-nowrap text-[2.15rem] font-black leading-none tracking-[-0.055em] sm:text-4xl">
              {distance.value}
              <span className="ml-1.5 text-xs font-bold tracking-normal text-white/60">{distance.label}</span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div>
                <div className="rr-number text-base font-bold">{t.home_week_runs(workoutCount)}</div>
                <div className="mt-0.5 text-[10px] text-white/45">{t.home_run_count_label}</div>
              </div>
              <div>
                <div className="rr-number text-base font-bold">{pace}</div>
                <div className="mt-0.5 text-[10px] text-white/45">{t.home_avg_pace_label}</div>
              </div>
            </div>
          </div>

          <div className="flex h-24 items-end justify-between gap-1.5 pt-2">
            {dailyDistanceM.map((value, index) => {
              const distanceSteps = dailyDistanceSteps[index];
              const percent = value > 0
                ? Math.max((distanceSteps / maxDistanceSteps) * 100, 12)
                : 5;
              return (
                <div key={dayLabels[index]} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
                  <span
                    className={`w-full max-w-2.5 rounded-pill ${value > 0 ? "bg-brand" : "bg-white/12"}`}
                    style={{ height: `${percent}%` }}
                  />
                  <span className="text-[9px] text-white/40">{dayLabels[index]}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function QuickAction({ href, icon, label }: { href: string; icon: HomeIconName; label: string }) {
  return (
    <Link href={href} className="group flex min-w-0 flex-col items-center gap-2 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-control border border-line bg-panel text-ink shadow-card transition-colors group-hover:border-brand/35 group-hover:bg-brand-soft group-hover:text-brand">
        <HomeIcon name={icon} />
      </span>
      <span className="max-w-full truncate text-[11px] font-semibold text-muted group-hover:text-ink">{label}</span>
    </Link>
  );
}

function HomeToolTile({
  href,
  icon,
  title,
}: {
  href: string;
  icon: HomeIconName;
  title: string;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-32 flex-col justify-between rounded-card border border-line bg-panel p-4 shadow-card transition-[background-color,border-color,transform] hover:border-brand/35 hover:bg-brand-soft active:scale-[0.99]"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-panel-muted text-brand transition-colors group-hover:bg-white">
        <HomeIcon name={icon} />
      </span>
      <span className="flex items-end justify-between gap-2">
        <span className="text-sm font-bold leading-snug text-ink">{title}</span>
        <span className="shrink-0 text-lg leading-none text-zinc-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand" aria-hidden="true">
          →
        </span>
      </span>
    </Link>
  );
}

function ActiveRaceFallback({
  href,
  title,
  goal,
  members,
}: {
  href: string;
  title: string;
  goal: string;
  members: string;
}) {
  const { t } = useLocale();
  return (
    <Link href={href} className="group relative block overflow-hidden rounded-hero bg-night p-card text-white shadow-float">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand">{t.races_filter_in_progress}</div>
      <div className="mt-2 flex items-center justify-between gap-4">
        <h3 className="truncate text-lg font-bold">{title}</h3>
        <span className="text-xl text-white/40 transition-transform group-hover:translate-x-0.5" aria-hidden="true">›</span>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-4 border-t border-white/10 pt-4 text-sm">
        <div>
          <div className="text-[10px] text-white/45">{t.home_goal_label}</div>
          <div className="rr-number mt-1 font-bold">{goal}</div>
        </div>
        <div>
          <div className="text-[10px] text-white/45">{t.home_participants_label}</div>
          <div className="rr-number mt-1 font-bold">{members}</div>
        </div>
      </div>
    </Link>
  );
}

function LinkAction({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={`inline-flex min-h-10 items-center justify-center rounded-control bg-brand px-4 text-xs font-bold text-night hover:bg-brand-hover active:bg-brand-pressed ${className}`}>
      {children}
    </Link>
  );
}

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
