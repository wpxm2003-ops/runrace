"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import { weeklyChartBarPercent, weeklyChartMaxDistanceM } from "@/lib/homeDashboard";
import { formatDistance, formatPace } from "@/lib/units";

export type HomeIconName =
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

export function HomeIcon({ name, className = "h-5 w-5" }: { name: HomeIconName; className?: string }) {
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

export function WeeklyActivityCard({
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
  const chartMaxDistanceM = weeklyChartMaxDistanceM(dailyDistanceM);
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
              const percent = weeklyChartBarPercent(value, chartMaxDistanceM);
              return (
                <div key={dayLabels[index]} className="flex h-full min-w-0 flex-1 flex-col items-center gap-1.5">
                  <div className="relative min-h-0 w-full flex-1">
                    <span
                      className={`absolute bottom-0 left-1/2 w-full max-w-2.5 -translate-x-1/2 rounded-pill ${value > 0 ? "bg-brand" : "bg-white/12"}`}
                      style={{ height: `${percent}%` }}
                    />
                  </div>
                  <span className="shrink-0 text-[9px] text-white/40">{dayLabels[index]}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

export function QuickAction({ href, icon, label }: { href: string; icon: HomeIconName; label: string }) {
  return (
    <Link href={href} className="group flex min-w-0 flex-col items-center gap-2 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-control border border-line bg-panel text-ink shadow-card transition-colors group-hover:border-brand/35 group-hover:bg-brand-soft group-hover:text-brand">
        <HomeIcon name={icon} />
      </span>
      <span className="max-w-full truncate text-[11px] font-semibold text-muted group-hover:text-ink">{label}</span>
    </Link>
  );
}

export function HomeToolTile({
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

export function ActiveRaceFallback({
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

export function LinkAction({
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
