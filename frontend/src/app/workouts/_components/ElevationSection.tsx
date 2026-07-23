"use client";

import { computeElevationStats } from "@/lib/elevation";
import type { LatLng } from "@/lib/workoutTrack";

type Props = {
  path: LatLng[];
};

const CHART_W = 320;
const CHART_H = 96;
const PAD_X = 10;
const PAD_Y = 10;
const MIN_DISPLAY_RANGE_M = 30;

function toChartPoints(
  profile: { distanceM: number; elevationM: number }[],
): (readonly [number, number])[] {
  const totalDistance = Math.max(1, profile[profile.length - 1].distanceM);
  const elevations = profile.map((p) => p.elevationM);
  const min = Math.min(...elevations);
  const max = Math.max(...elevations);
  const actualRange = max - min;
  const displayRange = Math.max(actualRange, MIN_DISPLAY_RANGE_M);
  const offset = (displayRange - actualRange) / 2;

  return profile.map((p) => {
    const x = PAD_X + (p.distanceM / totalDistance) * (CHART_W - PAD_X * 2);
    const y = PAD_Y + (1 - (p.elevationM - min + offset) / displayRange) * (CHART_H - PAD_Y * 2);
    return [x, y] as const;
  });
}

function buildLinePath(points: (readonly [number, number])[]): string {
  return points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");
}

function buildAreaPath(points: (readonly [number, number])[]): string {
  const line = buildLinePath(points);
  const last = points[points.length - 1];
  const first = points[0];
  return `${line} L ${last[0].toFixed(1)} ${CHART_H - PAD_Y} L ${first[0].toFixed(1)} ${CHART_H - PAD_Y} Z`;
}

export function ElevationSection({ path }: Props) {
  const stats = computeElevationStats(path);
  if (!stats) return null;

  const points = toChartPoints(stats.profile);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="mb-3">
        <p className="text-sm font-medium text-zinc-900">고도</p>
        <p className="mt-1 text-xs text-zinc-500">거리 흐름에 따른 고도 변화</p>
      </div>

      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="h-28 w-full overflow-visible">
        <defs>
          <linearGradient id="elevationArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.04" />
          </linearGradient>
        </defs>
        <path d={buildAreaPath(points)} fill="url(#elevationArea)" />
        <path d={buildLinePath(points)} fill="none" stroke="#059669" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <line x1={PAD_X} y1={CHART_H - PAD_Y} x2={CHART_W - PAD_X} y2={CHART_H - PAD_Y} stroke="#e4e4e7" strokeWidth="1" />
      </svg>
    </section>
  );
}
