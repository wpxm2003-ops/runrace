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
/**
 * Y축 최소 표시 폭(m). 실제 고저차가 이보다 작으면 차트를 꽉 채우지 않고 이 창에 담아
 * 데이터를 세로 중앙에 배치한다 — 평지런의 몇 m짜리 노이즈가 산맥처럼 과장되는 것을 막는다.
 * 실제 고저차가 이보다 크면(언덕런) 실제 폭으로 그려 원래대로 꽉 채운다.
 */
const MIN_DISPLAY_RANGE_M = 30;

/** 프로필 → 차트 좌표 배열. 세로 스케일에 최소 폭 floor + 중앙 정렬을 적용한다. */
function toChartPoints(
  profile: { distanceM: number; elevationM: number }[],
): (readonly [number, number])[] {
  const totalDistance = Math.max(1, profile[profile.length - 1].distanceM);
  const elevations = profile.map((p) => p.elevationM);
  const min = Math.min(...elevations);
  const max = Math.max(...elevations);
  const actualRange = max - min;
  // 실제 고저차가 최소 폭보다 작으면 그만큼만 그린다(평지는 평지답게).
  const displayRange = Math.max(actualRange, MIN_DISPLAY_RANGE_M);
  // 좁은 데이터를 차트 세로 중앙에 놓기 위한 오프셋(바닥에 붙지 않게).
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

export function ElevationSection({ path, unit }: Props) {
  const stats = computeElevationStats(path);
  if (!stats) return null;

  const totalDistanceM = stats.profile[stats.profile.length - 1].distanceM;
  const points = toChartPoints(stats.profile);

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
        <path d={buildAreaPath(points)} fill="url(#elevationArea)" />
        <path d={buildLinePath(points)} fill="none" stroke="#059669" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
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
