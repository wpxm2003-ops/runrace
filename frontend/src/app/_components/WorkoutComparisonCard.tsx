"use client";

import { useState } from "react";
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
  const [tab, setTab] = useState<"avg" | "prev">("avg");

  if (!cmp) return null;

  // avg 탭이고 비교할 데이터가 없으면 카드 자체를 숨김
  if (tab === "avg" && cmp.recentCount === 0 && !cmp.previous) return null;

  const showAvg = tab === "avg";
  const hasPrevData = cmp.previous !== null;

  // 탭별 비교 기준값
  const refDistM    = showAvg ? cmp.avgDistanceM             : (cmp.previous?.distanceM       ?? 0);
  const refDurSec   = showAvg ? cmp.avgDurationSec           : (cmp.previous?.durationSec      ?? 0);
  const refPaceSec  = showAvg ? cmp.avgPaceSec               : (cmp.previous?.avgPaceSecPerKm  ?? null);

  // 거리
  const distDeltaM  = currentDistanceM - refDistM;
  const distMore    = distDeltaM >= 0;
  const distPercent = refDistM > 0 ? Math.round((Math.abs(distDeltaM) / refDistM) * 100) : 0;

  // 시간
  const durDelta    = currentDurationSec - refDurSec;
  const durMore     = durDelta >= 0;
  const durPercent  = refDurSec > 0 ? Math.round((Math.abs(durDelta) / refDurSec) * 100) : 0;

  // 페이스
  const hasPace        = refPaceSec != null && currentPaceSec != null;
  const rawPaceDelta   = hasPace ? currentPaceSec - refPaceSec! : 0;
  const paceDeltaInUnit = hasPace
    ? Math.abs(unit === "mi" ? Math.round((rawPaceDelta * METERS_PER_MI) / 1000) : rawPaceDelta)
    : 0;
  const paceFaster  = rawPaceDelta < 0;
  const pacePercent = hasPace && refPaceSec! > 0
    ? Math.round((Math.abs(rawPaceDelta) / refPaceSec!) * 100)
    : 0;

  const showNoData = (showAvg && cmp.recentCount === 0) || (!showAvg && !hasPrevData);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      {/* 섹션 타이틀 */}
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {t.comparison_section_title}
      </div>

      {/* 탭 */}
      <div
        role="group"
        className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-zinc-100 p-1 ring-1 ring-inset ring-zinc-200/70"
      >
        {(["avg", "prev"] as const).map((key) => {
          const active = tab === key;
          const label = key === "avg" ? t.comparison_tab_avg : t.comparison_tab_prev;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => setTab(key)}
              className={`min-w-0 rounded-lg px-1 py-2 text-center text-xs font-semibold transition-all ${
                active
                  ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200/90"
                  : "text-zinc-500 hover:bg-zinc-200/50 hover:text-zinc-800"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* 데이터 없음 */}
      {showNoData ? (
        <p className="py-3 text-center text-sm text-zinc-400">{t.comparison_no_prev}</p>
      ) : (
        <>
          {/* 열 헤더 */}
          <div className="mb-1 grid grid-cols-3 gap-x-3">
            <span className="text-[10px] text-zinc-400">
              {showAvg ? t.comparison_avg_col : t.comparison_prev_col}
            </span>
            <span className="text-[10px] font-medium text-zinc-500">{t.comparison_today_col}</span>
            <span className="text-[10px] text-zinc-400">{t.comparison_summary_col}</span>
          </div>

          <div className="divide-y divide-zinc-100">
            <MetricRow
              avg={formatDistance(refDistM, unit)}
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
              avg={fmtDuration(refDurSec)}
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
                avg={formatPace(1000, refPaceSec!, unit)}
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
        </>
      )}
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
