"use client";

import { useState } from "react";
import { computeKmSplits } from "@/lib/workoutTrack";
import type { LatLng, KmSplit } from "@/lib/workoutTrack";
import type { Translations } from "@/lib/i18n/translations";
import { formatPaceSecPerUnit } from "@/lib/units";

type Props = {
  path: LatLng[];
  distanceM: number;
  workoutType: string;
  t: Translations;
};

function paceLabel(secPerKm: number): string {
  return formatPaceSecPerUnit(secPerKm);
}

function paceChangeLabel(delta: number, t: Translations): string {
  const abs = Math.abs(delta);
  return abs >= 60 ? formatPaceSecPerUnit(abs) : `${Math.round(abs)}${t.km_split_sec_unit}`;
}

export function KmSplitSection({ path, distanceM, workoutType, t }: Props) {
  const [open, setOpen] = useState(false);

  if (workoutType === "INDOOR" || distanceM < 3000) return null;

  // 마지막 미완 구간(<900m)은 제외 — 짧은 꼬리 조각이 '가장 빨랐던 구간'을 차지하고
  // 목록 맨 아래에 또 나타나, 요약 카드와 중복돼 보이는 문제가 있었다.
  const splits = computeKmSplits(path).filter((s) => s.distanceM >= 900);
  if (splits.length === 0) return null;

  const fastest = splits.reduce((a, b) => (a.paceSec < b.paceSec ? a : b));
  const slowest = splits.reduce((a, b) => (a.paceSec > b.paceSec ? a : b));

  const kmLabel = (s: KmSplit) => `${s.km} km`;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
      <div className="p-4 pb-3">
        <p className="text-sm font-medium text-zinc-800 mb-3">{t.km_split_title}</p>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-emerald-50 px-3 py-2.5">
            <p className="text-xs text-emerald-700 mb-1">{t.km_split_fastest}</p>
            <p className="text-sm font-medium text-emerald-900">{kmLabel(fastest)}</p>
            <p className="text-xs font-mono text-emerald-700 mt-0.5">{paceLabel(fastest.paceSec)}</p>
          </div>
          <div className="rounded-lg bg-orange-50 px-3 py-2.5">
            <p className="text-xs text-orange-700 mb-1">{t.km_split_slowest}</p>
            <p className="text-sm font-medium text-orange-900">{kmLabel(slowest)}</p>
            <p className="text-xs font-mono text-orange-700 mt-0.5">{paceLabel(slowest.paceSec)}</p>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-end border-t border-zinc-100 px-4 py-2.5 text-xs text-zinc-400 hover:bg-zinc-50"
      >
        <span>{open ? t.km_split_hide : t.km_split_show}</span>
      </button>

      {open && (
        <div className="border-t border-zinc-100">
          <div className="grid grid-cols-3 gap-x-2 px-4 py-1.5 text-xs font-medium text-zinc-400">
            <span>{t.km_split_col_km}</span>
            <span className="text-center">{t.km_split_col_pace}</span>
            <span className="text-right">{t.km_split_col_change}</span>
          </div>

          {splits.map((s) => {
            const isFastest = s === fastest;
            const isSlowest = s === slowest;
            const faster = s.paceChange != null && s.paceChange < 0;
            const slower = s.paceChange != null && s.paceChange > 0;

            return (
              <div
                key={s.km}
                className={[
                  "grid grid-cols-3 gap-x-2 border-t border-zinc-50 px-4 py-2.5 text-sm",
                  isFastest ? "bg-emerald-50" : isSlowest ? "bg-orange-50" : "",
                ].join(" ")}
              >
                <span
                  className={[
                    "text-sm",
                    isFastest ? "font-medium text-emerald-800" :
                    isSlowest ? "font-medium text-orange-800" :
                    "text-zinc-500",
                  ].join(" ")}
                >
                  {kmLabel(s)}
                </span>
                <span
                  className={[
                    "text-center font-mono font-medium",
                    isFastest ? "text-emerald-800" :
                    isSlowest ? "text-orange-800" :
                    "text-zinc-800",
                  ].join(" ")}
                >
                  {paceLabel(s.paceSec)}
                </span>
                <span
                  className={[
                    "text-right text-xs font-medium",
                    faster ? "text-emerald-600" :
                    slower ? "text-red-500" :
                    "text-zinc-400",
                  ].join(" ")}
                >
                  {s.paceChange == null
                    ? "—"
                    : faster
                      ? `▼ ${paceChangeLabel(s.paceChange, t)}`
                      : slower
                        ? `▲ ${paceChangeLabel(s.paceChange, t)}`
                        : "="}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
