"use client";

import { useParams } from "next/navigation";
import { useWorkoutShare } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { pathBounds } from "@/lib/pathBounds";
import { UnitToggle } from "@/app/_components/ui/UnitToggle";
import { formatDistance, formatPace } from "@/lib/units";
import { formatDuration } from "@/lib/workoutTrack";
import Link from "next/link";
import { track } from "@/lib/analytics";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import { useEffect, useMemo, useRef } from "react";

type PathPoint = { lat: number; lng: number };

function normalizePath(
  points: PathPoint[],
  width: number,
  height: number,
  padding: number,
): [number, number][] {
  if (points.length === 0) return [];

  const { minLat, maxLat, minLng, maxLng } = pathBounds(points);

  const latRange = maxLat - minLat || 1e-6;
  const lngRange = maxLng - minLng || 1e-6;

  const drawW = width - padding * 2;
  const drawH = height - padding * 2;
  const scale = Math.min(drawW / lngRange, drawH / latRange);
  const offX = (drawW - lngRange * scale) / 2;
  const offY = (drawH - latRange * scale) / 2;

  return points.map((p) => [
    padding + offX + (p.lng - minLng) * scale,
    padding + offY + (maxLat - p.lat) * scale,
  ]);
}

function PathSvg({ path, noRouteLabel }: { path: PathPoint[]; noRouteLabel: string }) {
  const W = 400;
  const H = 260;
  const PAD = 24;

  const pts = normalizePath(path, W, H, PAD);

  if (pts.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm" style={{ color: "#7E828B" }}>
        {noRouteLabel}
      </div>
    );
  }

  const d = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`)
    .join(" ");

  const [startX, startY] = pts[0];
  const [endX, endY] = pts[pts.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" aria-label="Running route">
      {/* 네온 경로 (글로우 레이어) */}
      <path d={d} fill="none" stroke="#22C55E" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" opacity="0.10" />
      <path d={d} fill="none" stroke="#34D399" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" opacity="0.25" />
      <path d={d} fill="none" stroke="#4ADE80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* 시작점 */}
      <circle cx={startX} cy={startY} r="5" fill="#4ADE80" />
      {/* 종료점 */}
      <circle cx={endX} cy={endY} r="6" fill="#FFFFFF" stroke="#4ADE80" strokeWidth="2" />
    </svg>
  );
}

export default function WorkoutShareContent() {
  const params = useParams();
  const rawId = params?.id as string | undefined;
  const id = useMemo(() => (rawId ? parseInt(rawId, 10) : null), [rawId]);

  // AppShell(Provider) 안이라 앱 전역 언어·단위를 그대로 따른다 — 헤더에서 바꾸면 즉시 반영.
  const { t, locale } = useLocale();
  const { unit, setUnit } = useUnit();
  const { data, error } = useWorkoutShare(Number.isFinite(id) ? id : null);

  // 공유 페이지 조회 — 유입 퍼널 측정(워크아웃당 1회).
  const viewTrackedRef = useRef(false);
  useEffect(() => {
    if (data && !viewTrackedRef.current) {
      viewTrackedRef.current = true;
      void track("share_view", { workoutType: data.workoutType });
    }
  }, [data]);

  if (error) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-zinc-50">
        <p className="text-sm text-zinc-500">{t.share_load_error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-zinc-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-600 border-t-transparent" />
      </div>
    );
  }

  const [distVal, distUnit] = formatDistance(data.distanceM, unit).split(" ");
  const time = formatDuration(data.durationSec);
  const pace = formatPace(data.distanceM, data.durationSec, unit);
  const stats: [string, string][] = [
    [t.stat_time, time],
    [t.stat_pace, pace],
    [t.stat_calories, `${data.calories}`],
  ];

  return (
    <div className="bg-zinc-50">
      <main className="mx-auto w-full max-w-sm space-y-3 px-4 py-4">
        {/* 페이지 타이틀 + 단위 토글 */}
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-zinc-900">{t.share_page_title}</h1>
          <UnitToggle unit={unit} onChange={setUnit} size="sm" />
        </div>

        {/* 블랙 기록 카드 — 저장하는 스토리 카드와 동일 톤 */}
        <div
          className="rounded-3xl p-5 shadow-sm"
          style={{ background: "linear-gradient(180deg, #0B0C10 0%, #17191F 100%)" }}
        >
          {/* 거리 히어로 */}
          <div className="text-xs" style={{ color: "#7E828B" }}>
            {t.stat_distance}
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-5xl font-semibold leading-none text-white">{distVal}</span>
            <span className="text-xl font-semibold" style={{ color: "#34D399" }}>
              {distUnit}
            </span>
          </div>

          {/* 경로 / 실내 */}
          <div
            className="my-4 h-40 overflow-hidden rounded-2xl"
            style={{ background: "#121319", border: "1px solid #24262D" }}
          >
            {data.workoutType === "INDOOR" ? (
              data.imageUrl ? (
                <img
                  src={data.imageUrl}
                  alt={t.indoor_field_image}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div
                  className="flex h-full items-center justify-center text-sm"
                  style={{ color: "#7E828B" }}
                >
                  🏃 {t.indoor_badge}
                </div>
              )
            ) : (
              <PathSvg path={data.path} noRouteLabel={t.share_no_route} />
            )}
          </div>

          {/* 스탯 — 시간 / 페이스 / 칼로리 */}
          <div className="grid grid-cols-3 pt-3" style={{ borderTop: "1px solid #1F2127" }}>
            {stats.map(([label, value]) => (
              <div key={label} className="text-center">
                <div className="text-xs" style={{ color: "#7E828B" }}>
                  {label}
                </div>
                <div className="mt-1 text-lg font-semibold text-white">{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 날짜 칩 */}
        <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
          <div className="text-sm text-zinc-600">{formatDate(data.startedAt, locale)}</div>
        </div>

        {/* 공유 링크를 본 사람을 유입으로 — 나도 시작하기 CTA */}
        <Link
          href="/"
          onClick={() => void track("share_cta_click", { workoutType: data.workoutType })}
          className="mt-2 block rounded-2xl bg-zinc-900 px-4 py-4 text-center text-sm font-semibold text-white shadow-sm transition-colors hover:bg-zinc-800"
        >
          {t.share_cta} →
        </Link>
      </main>
    </div>
  );
}
