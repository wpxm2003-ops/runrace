"use client";

import { useRef, useState } from "react";
import { Button } from "@/app/_components/ui/Button";
import { formatDate } from "@/lib/format";
import { pathBounds } from "@/lib/pathBounds";
import { formatDistance, formatPace, type DistanceUnit } from "@/lib/units";
import { formatDuration } from "@/lib/workoutTrack";
import type { Translations } from "@/lib/i18n/translations";
import type { WorkoutShare } from "@/lib/api/types";

type PathPoint = { lat: number; lng: number };

const CARD_W = 1080;
const CARD_H = 1920;

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

/** 카드 안의 네온 경로(글로우 레이어) — 다크 배경 전용 고정 색상. */
function RouteSvg({ path }: { path: PathPoint[] }) {
  const W = 880;
  const H = 600;
  const pts = normalizePath(path, W, H, 90);
  if (pts.length === 0) return null;
  const d = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`)
    .join(" ");
  const [sx, sy] = pts[0];
  const [ex, ey] = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" aria-hidden="true">
      <path d={d} fill="none" stroke="#22C55E" strokeWidth="40" strokeLinecap="round" strokeLinejoin="round" opacity="0.10" />
      <path d={d} fill="none" stroke="#34D399" strokeWidth="20" strokeLinecap="round" strokeLinejoin="round" opacity="0.25" />
      <path d={d} fill="none" stroke="#4ADE80" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={sx} cy={sy} r="15" fill="#4ADE80" />
      <circle cx={ex} cy={ey} r="17" fill="#FFFFFF" stroke="#4ADE80" strokeWidth="8" />
    </svg>
  );
}

const COLOR = {
  gray: "#7E828B",
  green: "#34D399",
  box: "#121319",
  boxBorder: "#24262D",
  divider: "#1F2127",
  date: "#6B6F77",
  footer: "#5C606A",
};

const FONT =
  'ui-sans-serif, system-ui, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

export function ShareCardButton({
  data,
  unit,
  locale,
  t,
}: {
  data: WorkoutShare;
  unit: DistanceUnit;
  locale: string;
  t: Translations;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [distVal, distUnit] = formatDistance(data.distanceM, unit).split(" ");
  const time = formatDuration(data.durationSec);
  const pace = formatPace(data.distanceM, data.durationSec, unit);
  const date = formatDate(data.startedAt, locale);

  async function renderBlob(): Promise<Blob | null> {
    const node = cardRef.current;
    if (!node) return null;
    const { toBlob } = await import("html-to-image");
    return toBlob(node, {
      width: CARD_W,
      height: CARD_H,
      pixelRatio: 1,
      cacheBust: true,
      backgroundColor: "#0B0C10",
    });
  }

  function downloadBlob(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "runrace.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /** 공유 시트(navigator.share). 미지원이면 이미지 저장으로 폴백. */
  async function onShare() {
    setBusy(true);
    setError(null);
    try {
      const blob = await renderBlob();
      if (!blob) throw new Error("no blob");
      const file = new File([blob], "runrace.png", { type: "image/png" });
      const canShareFiles =
        typeof navigator !== "undefined" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] });
      if (canShareFiles) {
        await navigator.share({ files: [file] });
      } else {
        downloadBlob(blob);
      }
    } catch (e) {
      // 공유 시트를 닫은 경우(AbortError)는 오류로 취급하지 않는다.
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setError(t.share_card_error);
      }
    } finally {
      setBusy(false);
    }
  }

  /** 카카오 등에서 공유 파일이 안 받아지는 경우를 위한 직접 저장. */
  async function onDownload() {
    setBusy(true);
    setError(null);
    try {
      const blob = await renderBlob();
      if (!blob) throw new Error("no blob");
      downloadBlob(blob);
    } catch {
      setError(t.share_card_error);
    } finally {
      setBusy(false);
    }
  }

  const stats: [string, string][] = [
    [t.stat_time, time],
    [t.stat_pace, pace],
    [t.stat_calories, `${data.calories}`],
  ];

  return (
    <>
      <div className="flex gap-2">
        <Button className="flex-1 px-4 py-3 text-sm font-medium" onClick={onShare} disabled={busy}>
          {busy ? t.share_card_busy : t.share_card_share}
        </Button>
        <Button
          className="flex-1 px-4 py-3 text-sm font-medium"
          onClick={onDownload}
          disabled={busy}
        >
          {t.share_card_download}
        </Button>
      </div>
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}

      {/* 캡처 전용 오프스크린 카드 (1080×1920) */}
      <div
        aria-hidden="true"
        style={{ position: "absolute", left: "-99999px", top: 0, pointerEvents: "none" }}
      >
        <div
          ref={cardRef}
          style={{
            width: CARD_W,
            height: CARD_H,
            boxSizing: "border-box",
            padding: "110px 100px 90px",
            background: "linear-gradient(180deg, #0B0C10 0%, #17191F 100%)",
            color: "#FFFFFF",
            fontFamily: FONT,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* 거리 히어로 */}
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 42, color: COLOR.gray, letterSpacing: 1 }}>{t.stat_distance}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 24, marginTop: 10 }}>
              <div style={{ fontSize: 250, fontWeight: 800, lineHeight: 1, letterSpacing: -4 }}>
                {distVal}
              </div>
              <div style={{ fontSize: 96, fontWeight: 700, color: COLOR.green }}>{distUnit}</div>
            </div>
          </div>

          {/* 경로 / 실내 뱃지 */}
          <div
            style={{
              marginTop: 70,
              height: 600,
              borderRadius: 44,
              background: COLOR.box,
              border: `1px solid ${COLOR.boxBorder}`,
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {data.workoutType === "GPS" && data.path.length > 0 ? (
              <RouteSvg path={data.path} />
            ) : (
              <div style={{ fontSize: 56, color: COLOR.gray }}>🏃 {t.indoor_badge}</div>
            )}
          </div>

          {/* 스탯 */}
          <div
            style={{
              marginTop: 80,
              paddingTop: 64,
              borderTop: `1px solid ${COLOR.divider}`,
              display: "flex",
            }}
          >
            {stats.map(([label, value]) => (
              <div key={label} style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: 42, color: COLOR.gray }}>{label}</div>
                <div style={{ fontSize: 86, fontWeight: 600, marginTop: 16 }}>{value}</div>
              </div>
            ))}
          </div>

          <div style={{ flex: 1 }} />

          {/* 날짜 + 푸터 */}
          <div style={{ fontSize: 50, color: COLOR.date, letterSpacing: 1 }}>{date}</div>
          <div style={{ marginTop: 28, display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: COLOR.green }} />
            <div style={{ fontSize: 40, color: COLOR.footer }}>runrace.co.kr</div>
          </div>
        </div>
      </div>
    </>
  );
}
