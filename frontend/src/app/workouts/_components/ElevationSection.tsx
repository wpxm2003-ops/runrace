"use client";

import { computeElevationStats } from "@/lib/elevation";
import { useUnit } from "@/lib/UnitContext";
import { formatElevation } from "@/lib/units";
import type { LatLng } from "@/lib/workoutTrack";

type Props = {
  path: LatLng[];
};

const CHART_W = 320;
const CHART_H = 96;
const PAD_X = 10;
const PAD_Y = 10;
/**
 * 평지 코스의 잔여 GPS 드리프트(수 m)가 차트를 꽉 채워 산길처럼 보이지 않게 두는 표시 범위 하한.
 *
 * 30m였을 때는 반대로 실제 지형이 안 보였다(실측 회귀: 잠실 1km 걷기의 −6m 굴다리 딥이
 * 76px 중 17px로만 그려짐). 12m로 낮추되, 눈금에 실제 고도를 함께 적어 과장 여부를
 * 숫자로 확인할 수 있게 했다 — 하한의 목적은 오해 방지지, 지형을 숨기는 게 아니다.
 */
const MIN_DISPLAY_RANGE_M = 12;

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
  const { unit } = useUnit();
  const stats = computeElevationStats(path);
  if (!stats) return null;

  const points = toChartPoints(stats.profile);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="mb-3">
        <p className="text-sm font-medium text-zinc-900">고도</p>
        <p className="mt-1 text-xs text-zinc-500">거리 흐름에 따른 고도 변화 · 최저점 기준</p>
      </div>

      <div className="relative">
        {/*
          preserveAspectRatio="none" — 기본값(xMidYMid meet)이면 viewBox 비율(320:96)에 맞춰
          높이 기준으로 축소된 뒤 가운데 정렬돼, 넓은 카드에서 차트가 폭의 3분의 1만 차지하고
          좌우가 텅 빈다(실측 회귀). 가로·세로는 단위가 다르므로 비율을 지킬 이유가 없다.
          대신 선이 가로로 늘어나지 않게 stroke는 vector-effect로 화면 좌표에 고정한다.
        */}
        <svg
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          preserveAspectRatio="none"
          className="h-28 w-full overflow-visible"
        >
          <defs>
            <linearGradient id="elevationArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.04" />
            </linearGradient>
          </defs>
          <path d={buildAreaPath(points)} fill="url(#elevationArea)" />
          <path d={buildLinePath(points)} fill="none" stroke="#059669" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <line x1={PAD_X} y1={CHART_H - PAD_Y} x2={CHART_W - PAD_X} y2={CHART_H - PAD_Y} stroke="#e4e4e7" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        </svg>

        {/*
          눈금은 SVG 밖(HTML)에 둔다 — preserveAspectRatio="none" 안의 <text>는 가로로
          늘어나 글자가 찌그러진다. 표시 범위 하한 때문에 차트가 과장돼 보일 수 있으므로,
          실제 고저차를 숫자로 함께 읽을 수 있어야 한다.

          절대 해발고도가 아니라 최저점 기준 상대값을 적는다. Android(플러그인이 넘기는
          Location.getAltitude())는 WGS84 타원체고, iOS(CLLocation.altitude)는 해발고도라
          같은 장소도 플랫폼마다 20m 넘게 어긋난다(한국 지오이드 고도차 약 +24m).
          상대값은 그 오프셋이 상쇄돼 두 플랫폼에서 모두 맞고, 러너에게도 해발고도보다
          고저차가 쓸모 있다.
        */}
        <span className="pointer-events-none absolute right-0 top-0 text-[10px] tabular-nums text-zinc-400">
          +{formatElevation(stats.maxElevationM - stats.minElevationM, unit)}
        </span>
        <span className="pointer-events-none absolute bottom-0 right-0 text-[10px] tabular-nums text-zinc-400">
          {formatElevation(0, unit)}
        </span>
      </div>
    </section>
  );
}
