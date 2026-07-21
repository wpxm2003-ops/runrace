"use client";

import { computeElevationStats } from "@/lib/elevation";
import type { LatLng } from "@/lib/workoutTrack";
import type { DistanceUnit } from "@/lib/units";
import { formatDistance, formatElevation } from "@/lib/units";

type Props = {
  path: LatLng[];
  unit: DistanceUnit;
};

const CHART_W = 320;
const CHART_H = 96;
const PAD_X = 10;
const PAD_Y = 10;

function buildAreaPath(profile: { distanceM: number; elevationM: number }[]): string {
  const totalDistance = Math.max(1, profile[profile.length - 1].distanceM);
  const elevations = profile.map((p) => p.elevationM);
  const min = Math.min(...elevations);
  const max = Math.max(...elevations);
  const range = Math.max(1, max - min);

  const points = profile.map((p) => {
    const x = PAD_X + (p.distanceM / totalDistance) * (CHART_W - PAD_X * 2);
    const y = PAD_Y + (1 - (p.elevationM - min) / range) * (CHART_H - PAD_Y * 2);
    return [x, y] as const;
  });

  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  const first = points[0];
  return `${line} L ${last[0].toFixed(1)} ${CHART_H - PAD_Y} L ${first[0].toFixed(1)} ${CHART_H - PAD_Y} Z`;
}

function buildLinePath(profile: { distanceM: number; elevationM: number }[]): string {
  const totalDistance = Math.max(1, profile[profile.length - 1].distanceM);
  const elevations = profile.map((p) => p.elevationM);
  const min = Math.min(...elevations);
  const max = Math.max(...elevations);
  const range = Math.max(1, max - min);

  return profile
    .map((p, i) => {
      const x = PAD_X + (p.distanceM / totalDistance) * (CHART_W - PAD_X * 2);
      const y = PAD_Y + (1 - (p.elevationM - min) / range) * (CHART_H - PAD_Y * 2);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

export function ElevationSection({ path, unit }: Props) {
  const stats = computeElevationStats(path);
  if (!stats) return null;

  const totalDistanceM = stats.profile[stats.profile.length - 1].distanceM;

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-900">고도</p>
          <p className="mt-1 text-xs text-zinc-500">거리 흐름에 따른 고도 변화</p>
        </div>
        <div className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
          +{formatElevation(stats.totalAscentM, unit)}
        </div>
      </div>

      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="h-28 w-full overflow-visible">
        <defs>
          <linearGradient id="elevationArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.04" />
          </linearGradient>
        </defs>
        <path d={buildAreaPath(stats.profile)} fill="url(#elevationArea)" />
        <path d={buildLinePath(stats.profile)} fill="none" stroke="#059669" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <line x1={PAD_X} y1={CHART_H - PAD_Y} x2={CHART_W - PAD_X} y2={CHART_H - PAD_Y} stroke="#e4e4e7" strokeWidth="1" />
      </svg>

      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        <div className="rounded-lg bg-zinc-50 px-2 py-2">
          <p className="text-[11px] text-zinc-500">상승</p>
          <p className="mt-0.5 text-xs font-semibold text-zinc-900">{formatElevation(stats.totalAscentM, unit)}</p>
        </div>
        <div className="rounded-lg bg-zinc-50 px-2 py-2">
          <p className="text-[11px] text-zinc-500">하강</p>
          <p className="mt-0.5 text-xs font-semibold text-zinc-900">{formatElevation(stats.totalDescentM, unit)}</p>
        </div>
        <div className="rounded-lg bg-zinc-50 px-2 py-2">
          <p className="text-[11px] text-zinc-500">최고</p>
          <p className="mt-0.5 text-xs font-semibold text-zinc-900">{formatElevation(stats.maxElevationM, unit)}</p>
        </div>
        <div className="rounded-lg bg-zinc-50 px-2 py-2">
          <p className="text-[11px] text-zinc-500">최저</p>
          <p className="mt-0.5 text-xs font-semibold text-zinc-900">{formatElevation(stats.minElevationM, unit)}</p>
        </div>
      </div>

      <div className="mt-2 flex justify-between text-[11px] text-zinc-400">
        <span>0</span>
        <span>{formatDistance(totalDistanceM, unit)}</span>
      </div>
    </section>
  );
}
