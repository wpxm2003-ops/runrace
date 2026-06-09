"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiUrl } from "@/lib/api/client";
import { formatDate } from "@/lib/format";
import { pathBounds } from "@/lib/pathBounds";
import { WorkoutStatGrid } from "@/app/_components/WorkoutStatGrid";
import type { DistanceUnit } from "@/lib/units";
import { LOCALES, translations, type Locale } from "@/lib/i18n/translations";

type PathPoint = { lat: number; lng: number };

type WorkoutShare = {
  durationSec: number;
  distanceM: number;
  calories: number;
  avgPaceSecPerKm: number | null;
  startedAt: string;
  path: PathPoint[];
  workoutType: "GPS" | "INDOOR";
  imageUrl: string | null;
};

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
      <div className="flex h-full w-full items-center justify-center text-sm text-zinc-400">
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
      {/* 경로 */}
      <path
        d={d}
        fill="none"
        stroke="#16a34a"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.15"
      />
      <path
        d={d}
        fill="none"
        stroke="#16a34a"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* 시작점 */}
      <circle cx={startX} cy={startY} r="5" fill="#16a34a" />
      {/* 종료점 */}
      <circle cx={endX} cy={endY} r="6" fill="white" stroke="#16a34a" strokeWidth="2" />
    </svg>
  );
}

export default function WorkoutShareContent() {
  const params = useParams();
  const id = params?.id as string | undefined;

  const [data, setData] = useState<WorkoutShare | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 공개 페이지(Provider 밖)라 로컬에서 단위·언어를 직접 해석한다.
  // 로그인 유저는 본인 선호(localStorage), 외부 방문자는 브라우저 언어로 폴백.
  const [unit, setUnit] = useState<DistanceUnit>("km");
  const [locale, setLocale] = useState<Locale>("ko");

  useEffect(() => {
    const storedUnit = localStorage.getItem("runrace_unit");
    if (storedUnit === "km" || storedUnit === "mi") setUnit(storedUnit);

    const storedLocale = localStorage.getItem("runrace_locale");
    if (storedLocale && LOCALES.some((l) => l.code === storedLocale)) {
      setLocale(storedLocale as Locale);
    } else {
      const lang = navigator.language.toLowerCase();
      const match = LOCALES.find((l) => lang.startsWith(l.code));
      if (match) setLocale(match.code);
    }
  }, []);

  const t = translations[locale];

  useEffect(() => {
    if (!id) return;
    fetch(apiUrl(`/api/workouts/${id}/share`), { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json() as Promise<WorkoutShare>;
      })
      .then(setData)
      .catch((e: unknown) => setError(String(e)));
  }, [id]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <p className="text-sm text-zinc-500">{t.share_load_error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <main className="mx-auto w-full max-w-sm flex-1 space-y-3 px-4 py-4">
        {/* 페이지 타이틀 + 단위 토글 */}
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-zinc-900">{t.share_page_title}</h1>
          <div className="inline-flex rounded-lg border border-zinc-200 p-0.5 text-xs">
            {(["km", "mi"] as const).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnit(u)}
                className={`rounded-md px-2 py-1 font-medium ${
                  unit === u ? "bg-zinc-900 text-white" : "text-zinc-500"
                }`}
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        {/* 경로/이미지 카드 */}
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="h-48 sm:h-64">
            {data.workoutType === "INDOOR" ? (
              data.imageUrl ? (
                <img
                  src={data.imageUrl}
                  alt={t.indoor_field_image}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center bg-zinc-50 text-sm text-zinc-400">
                  🏃 {t.indoor_badge}
                </div>
              )
            ) : (
              <PathSvg path={data.path} noRouteLabel={t.share_no_route} />
            )}
          </div>
        </div>

        {/* 스탯 카드 — 운동 상세·기록 패널과 공통 컴포넌트 */}
        <WorkoutStatGrid
          durationSec={data.durationSec}
          distanceM={data.distanceM}
          calories={data.calories}
          columns={2}
          unit={unit}
          labels={{
            time: t.stat_time,
            distance: t.stat_distance,
            pace: t.stat_pace,
            calories: t.stat_calories,
          }}
        />

        {/* 날짜 카드 — WorkoutRecordPanel의 시간 카드와 동일 */}
        <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
          <div className="text-sm text-zinc-600">{formatDate(data.startedAt, locale)}</div>
        </div>
      </main>
    </div>
  );
}
