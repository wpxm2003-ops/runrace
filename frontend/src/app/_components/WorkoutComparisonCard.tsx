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
  const pacePercent =
    hasPace && avgPaceSec > 0 ? Math.round((Math.abs(rawPaceDelta) / avgPaceSec) * 100) : 0;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {t.comparison_recent_avg}
      </div>

      {/* 열 헤더 */}
      <div className="mb-1 grid grid-cols-3 gap-x-3">
        <span className="text-[10px] text-zinc-400">{t.comparison_avg_col}</span>
        <span className="text-[10px] font-medium text-zinc-500">{t.comparison_today_col}</span>
        <span className="text-[10px] text-zinc-400">{t.comparison_summary_col}</span>
      </div>

      <div className="divide-y divide-zinc-100">
        <MetricRow
          avg={formatDistance(avgDistanceM, unit)}
          current={formatDistance(currentDistanceM, unit)}
          badge={
            distDeltaM === 0
              ? null
              : distMore
                ? { text: t.comparison_dist_more(formatDistance(Math.abs(distDeltaM), unit), distPercent), positive: true }
                : { text: t.comparison_dist_less(formatDistance(Math.abs(distDeltaM), unit), distPercent), positive: false }
          }
        />
        <MetricRow
          avg={fmtDuration(avgDurationSec)}
          current={fmtDuration(currentDurationSec)}
          badge={
            durDelta === 0
              ? null
              : durMore
                ? { text: t.comparison_dist_more(fmtDuration(Math.abs(durDelta)), durPercent), positive: true }
                : { text: t.comparison_dist_less(fmtDuration(Math.abs(durDelta)), durPercent), positive: false }
          }
        />
        {hasPace ? (
          <MetricRow
            avg={formatPace(1000, avgPaceSec!, unit)}
            current={formatPace(1000, currentPaceSec!, unit)}
            badge={
              rawPaceDelta === 0
                ? null
                : paceFaster
                  ? { text: t.comparison_pace_faster(paceDeltaInUnit, unit, pacePercent), positive: true }
                  : { text: t.comparison_pace_slower(paceDeltaInUnit, unit, pacePercent), positive: false }
            }
          />
        ) : null}
      </div>
    </div>
  );
}

function MetricRow({
  avg,
  current,
  badge,
}: {
  avg: string;
  current: string;
  badge: { text: string; positive: boolean } | null;
}) {
  return (
    <div className="grid grid-cols-3 items-start gap-x-3 py-2.5">
      <span className="text-sm text-zinc-400">{avg}</span>
      <span className="text-sm font-semibold text-zinc-900">{current}</span>
      {badge ? (
        <div className={`text-xs font-medium leading-snug ${badge.positive ? "text-green-600" : "text-red-500"}`}>
          {badge.text.split(" · ").map((part, i) => (
            <div key={i}>{part}</div>
          ))}
        </div>
      ) : (
        <span />
      )}
    </div>
  );
}
