"use client";

import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import { formatDistance } from "@/lib/units";
import type { WorkoutStatus } from "@/lib/workoutTrack";

type StatCardProps = { label: string; value: string };

function StatCard({ label, value }: StatCardProps) {
  return (
    <div className="flex min-h-[4.25rem] flex-col justify-center rounded-xl border border-zinc-200 bg-white px-3 py-2 shadow-sm sm:min-h-[5rem] sm:rounded-2xl sm:px-4 sm:py-3">
      <div className="text-[11px] text-zinc-500 sm:text-xs">{label}</div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums text-zinc-900 sm:mt-1 sm:text-2xl">
        {value}
      </div>
    </div>
  );
}

type WorkoutStatsGridProps = {
  status: WorkoutStatus;
  elapsedLabel: string;
  /** 칼로리 대신 이동 거리(m)를 표시한다. */
  distanceM: number;
  paceLabel: string;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  stopDisabled?: boolean;
};

export function WorkoutStatsGrid({
  status,
  elapsedLabel,
  distanceM,
  paceLabel,
  onStart,
  onPause,
  onResume,
  onStop,
  stopDisabled = false,
}: WorkoutStatsGridProps) {
  const { t } = useLocale();
  const { unit } = useUnit();

  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3">
      <StatCard label={t.stat_time} value={elapsedLabel} />
      <StatCard label={t.stat_distance} value={formatDistance(distanceM, unit)} />
      <StatCard label={t.stat_pace} value={paceLabel} />
      <div className="flex min-h-[4.25rem] flex-col justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-2.5 py-2 shadow-sm sm:min-h-[5rem] sm:gap-2 sm:rounded-2xl sm:px-3 sm:py-3">
        {status === "idle" ? (
          <button type="button" onClick={onStart}
            className="h-10 w-full rounded-xl bg-zinc-900 text-sm font-medium text-white hover:bg-zinc-800 sm:h-12">
            {t.workout_start}
          </button>
        ) : status === "running" ? (
          <button type="button" onClick={onPause}
            className="h-10 w-full rounded-xl border-2 border-zinc-900 bg-white text-sm font-medium text-zinc-900 hover:bg-zinc-50 sm:h-12">
            {t.workout_pause}
          </button>
        ) : (
          <>
            <button type="button" onClick={onResume}
              className="h-9 w-full rounded-xl bg-zinc-900 text-sm font-medium text-white hover:bg-zinc-800 sm:h-10">
              {t.workout_resume}
            </button>
            <button type="button" disabled={stopDisabled} onClick={onStop}
              className="h-9 w-full rounded-xl border border-red-200 bg-red-50 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 sm:h-10">
              {stopDisabled ? t.workout_stop_saving : t.workout_stop}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
