"use client";

import { useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { useWorkoutListByYear, fetchWorkout } from "@/lib/api";
import type { WorkoutListItem } from "@/lib/api/types";
import { monthBests } from "@/lib/workoutStats";
import { MIN_GHOST_CANDIDATE_M, ensureGhostTimestamps } from "@/lib/ghostRace";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import { formatDistance, formatPace } from "@/lib/units";
import { formatMonthDayTime } from "@/lib/format";
import { useNativeBack } from "@/lib/useNativeBack";
import type { LatLng } from "@/lib/workoutTrack";

export type GhostSelection = {
  id: number;
  label: string;
  distanceM: number;
  path: LatLng[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSelect: (ghost: GhostSelection) => void;
  user: User;
};

function ghostLabel(distanceM: number, unit: "km" | "mi"): string {
  return formatDistance(distanceM, unit);
}

function Row({
  item,
  tag,
  loading,
  unit,
  locale,
  onPick,
}: {
  item: WorkoutListItem;
  tag?: string;
  loading: boolean;
  unit: "km" | "mi";
  locale: string;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={loading}
      className="flex w-full items-center justify-between rounded-xl border border-zinc-200 px-3 py-2.5 text-left disabled:opacity-50"
    >
      <div>
        <div className="flex items-center gap-1.5">
          {tag ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
              {tag}
            </span>
          ) : null}
          <span className="text-sm font-medium text-zinc-900">
            {formatDistance(item.distanceM, unit)}
          </span>
          {item.avgPaceSecPerKm ? (
            <span className="text-xs text-zinc-500">
              {formatPace(1000, item.avgPaceSecPerKm, unit)}
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 text-xs text-zinc-400">
          {formatMonthDayTime(item.startedAt, locale)}
        </div>
      </div>
    </button>
  );
}

export function GhostPicker({ open, onClose, onSelect, user }: Props) {
  const { t, locale } = useLocale();
  const { unit } = useUnit();
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // open일 때만 조회 — 시트를 열지 않으면 워크아웃 페이지 진입만으로 요청이 나가지 않는다.
  const thisYear = new Date().getFullYear();
  const { data: yearItems } = useWorkoutListByYear(open ? user : null, thisYear);
  const { data: prevYearItems } = useWorkoutListByYear(open ? user : null, thisYear - 1);

  useNativeBack(onClose, open);

  const candidates = useMemo(() => {
    const all = [...(yearItems ?? []), ...(prevYearItems ?? [])];
    return all.filter((w) => w.workoutType === "GPS" && w.distanceM >= MIN_GHOST_CANDIDATE_M);
  }, [yearItems, prevYearItems]);

  const { longestRun, fastestPace } = useMemo(() => monthBests(candidates), [candidates]);

  const recent = useMemo(() => {
    const usedIds = new Set([longestRun?.id, fastestPace?.id].filter((id): id is number => id != null));
    return [...candidates]
      .filter((w) => !usedIds.has(w.id))
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .slice(0, 5);
  }, [candidates, longestRun, fastestPace]);

  async function pick(item: WorkoutListItem) {
    setError(null);
    setLoadingId(item.id);
    try {
      const detail = await fetchWorkout(item.id, user);
      onSelect({
        id: detail.id,
        label: ghostLabel(detail.distanceM, unit),
        distanceM: detail.distanceM,
        // 구형 기록(경로에 t 없음)도 유령으로 쓸 수 있게 t를 합성한다.
        path: ensureGhostTimestamps(detail.path, detail.durationSec),
      });
      onClose();
    } catch {
      setError(t.prize_load_error);
    } finally {
      setLoadingId(null);
    }
  }

  if (!open) return null;

  const loaded = yearItems != null && prevYearItems != null;

  return (
    <>
      <div className="fixed inset-0 z-[100] bg-black/40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-[110] max-h-[80vh] overflow-y-auto rounded-t-2xl bg-white px-4 pb-8">
        <div className="py-3 text-center text-sm font-medium text-zinc-600">
          {t.ghost_picker_title}
        </div>
        <p className="mb-4 text-center text-xs text-zinc-400">{t.ghost_chip_subtitle}</p>

        {error ? <p className="mb-3 text-center text-xs text-red-600">{error}</p> : null}

        {!loaded ? (
          <p className="py-8 text-center text-sm text-zinc-400">{t.ghost_picker_loading}</p>
        ) : candidates.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-400">{t.ghost_picker_empty}</p>
        ) : (
          <div className="space-y-5">
            {fastestPace || longestRun ? (
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-400">
                  {t.ghost_section_challenge}
                </div>
                <div className="space-y-2">
                  {fastestPace ? (
                    <Row
                      item={fastestPace}
                      tag={t.ghost_candidate_best_pace}
                      loading={loadingId === fastestPace.id}
                      unit={unit}
                      locale={locale}
                      onPick={() => pick(fastestPace)}
                    />
                  ) : null}
                  {longestRun && longestRun.id !== fastestPace?.id ? (
                    <Row
                      item={longestRun}
                      tag={t.ghost_candidate_longest}
                      loading={loadingId === longestRun.id}
                      unit={unit}
                      locale={locale}
                      onPick={() => pick(longestRun)}
                    />
                  ) : null}
                </div>
              </div>
            ) : null}

            {recent.length > 0 ? (
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-400">
                  {t.ghost_section_recent}
                </div>
                <div className="space-y-2">
                  {recent.map((item) => (
                    <Row
                      key={item.id}
                      item={item}
                      loading={loadingId === item.id}
                      unit={unit}
                      locale={locale}
                      onPick={() => pick(item)}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-5 h-11 w-full rounded-xl border border-zinc-200 text-sm text-zinc-600"
        >
          {t.cancel}
        </button>
      </div>
    </>
  );
}
