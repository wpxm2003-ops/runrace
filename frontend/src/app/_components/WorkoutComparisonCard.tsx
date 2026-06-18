"use client";

import type { User } from "firebase/auth";
import { useWorkoutComparison } from "@/lib/api";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import { formatDistance, formatPace } from "@/lib/units";

type Props = {
  workoutId: number;
  currentPaceSec: number | null;
  currentDistanceM: number;
  currentDurationSec: number;
  user: User;
};

const METERS_PER_MI = 1609.344;

function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function WorkoutComparisonCard({
  workoutId,
  currentPaceSec,
  currentDistanceM,
  currentDurationSec,
  user,
}: Props) {
  const { t } = useLocale();
  const { unit } = useUnit();
  const { data: cmp } = useWorkoutComparison(workoutId, user);

  if (!cmp || cmp.recentCount === 0) return null;

  const { avgPaceSec, avgDistanceM, avgDurationSec } = cmp;

  // 거리
  const distDeltaM = currentDistanceM - avgDistanceM;
  const distMore = distDeltaM >= 0;
  const distPercent = avgDistanceM > 0 ? Math.round((Math.abs(distDeltaM) / avgDistanceM) * 100) : 0;

  // 시간
  const durDelta = currentDurationSec - avgDurationSec;
  const durMore = durDelta >= 0;
  const durPercent = avgDurationSec > 0 ? Math.round((Math.abs(durDelta) / avgDurationSec) * 100) : 0;

  // 페이스
  const hasPace = avgPaceSec != null && currentPaceSec != null;
  const rawPaceDelta = hasPace ? currentPaceSec - avgPaceSec : 0;
  const paceDeltaInUnit = hasPace
    ? Math.abs(unit === "mi" ? Math.round((rawPaceDelta * METERS_PER_MI) / 1000) : rawPaceDelta)
    : 0;
  const paceFaster = rawPaceDelta < 0;
  const pacePercent = hasPace && avgPaceSec > 0
    ? Math.round((Math.abs(rawPaceDelta) / avgPaceSec) * 100)
    : 0;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {t.comparison_recent_avg}
      </div>
      <div className="space-y-2.5">
        <Row
          label={t.comparison_distance_label}
          avg={formatDistance(avgDistanceM, unit)}
          current={formatDistance(currentDistanceM, unit)}
          badge={
            distDeltaM === 0 ? null : distMore
              ? { text: t.comparison_dist_more(formatDistance(Math.abs(distDeltaM), unit), distPercent), positive: true }
              : { text: t.comparison_dist_less(formatDistance(Math.abs(distDeltaM), unit), distPercent), positive: false }
          }
        />
        <Row
          label={t.comparison_duration_label}
          avg={fmtDuration(avgDurationSec)}
          current={fmtDuration(currentDurationSec)}
          badge={
            durDelta === 0 ? null : durMore
              ? { text: t.comparison_dist_more(fmtDuration(Math.abs(durDelta)), durPercent), positive: true }
              : { text: t.comparison_dist_less(fmtDuration(Math.abs(durDelta)), durPercent), positive: false }
          }
        />
        {hasPace ? (
          <Row
            label={t.comparison_pace_label}
            avg={formatPace(1000, avgPaceSec!, unit)}
            current={formatPace(1000, currentPaceSec!, unit)}
            badge={
              rawPaceDelta === 0 ? null : paceFaster
                ? { text: t.comparison_pace_faster(paceDeltaInUnit, unit, pacePercent), positive: true }
                : { text: t.comparison_pace_slower(paceDeltaInUnit, unit, pacePercent), positive: false }
            }
          />
        ) : null}
      </div>
    </div>
  );
}

function Row({
  label,
  avg,
  current,
  badge,
}: {
  label: string;
  avg: string;
  current: string;
  badge: { text: string; positive: boolean } | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span className="w-16 shrink-0 text-xs text-zinc-400">{label}</span>
      <span className="text-zinc-400">{avg}</span>
      <span className="text-zinc-300">→</span>
      <span className="font-semibold text-zinc-900">{current}</span>
      {badge ? (
        <span className={`ml-auto text-xs font-medium ${badge.positive ? "text-green-600" : "text-red-500"}`}>
          {badge.text}
        </span>
      ) : null}
    </div>
  );
}
