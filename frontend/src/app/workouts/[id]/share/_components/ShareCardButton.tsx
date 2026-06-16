"use client";

import { useRef, useState } from "react";
import { Button } from "@/app/_components/ui/Button";
import { formatDate } from "@/lib/format";
import { pathBounds } from "@/lib/pathBounds";
import { formatDistance, formatPace, type DistanceUnit } from "@/lib/units";
import { formatDuration } from "@/lib/workoutTrack";
import { track } from "@/lib/analytics";
import type { Translations } from "@/lib/i18n/translations";

type PathPoint = { lat: number; lng: number };

/** 카드 렌더에 필요한 최소 필드 — 운동 상세/공유 응답 모두와 호환. */
type CardData = {
  distanceM: number;
  durationSec: number;
  calories: number;
  startedAt: string;
  workoutType: "GPS" | "INDOOR";
  path: PathPoint[];
};

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
  date: "#FFFFFF",
  footer: "#5C606A",
};

const FONT =
  'ui-sans-serif, system-ui, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

/** Blob → base64 문자열(데이터 URL 접두어 제거). Capacitor Filesystem 저장용. */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function ShareCardButton({
  data,
  unit,
  locale,
  t,
  triggerClassName,
}: {
  data: CardData;
  unit: DistanceUnit;
  locale: string;
  t: Translations;
  triggerClassName?: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [distVal, distUnit] = formatDistance(data.distanceM, unit).split(" ");
  const time = formatDuration(data.durationSec);
  const pace = formatPace(data.distanceM, data.durationSec, unit);
  const date = formatDate(data.startedAt, locale);

  async function onSave() {
    const node = cardRef.current;
    if (!node) return;
    setBusy(true);
    setError(null);
    try {
      const { toBlob } = await import("html-to-image");
      const blob = await toBlob(node, {
        width: CARD_W,
        height: CARD_H,
        pixelRatio: 1,
        cacheBust: true,
        backgroundColor: "#0B0C10",
      });
      if (!blob) throw new Error("no blob");

      const { Capacitor } = await import("@capacitor/core");
      if (Capacitor.isNativePlatform()) {
        // 네이티브: 캐시에 파일로 쓴 뒤 OS "사진에 저장"으로 연결(갤러리 저장).
        const base64 = await blobToBase64(blob);
        const { Filesystem, Directory } = await import("@capacitor/filesystem");
        const written = await Filesystem.writeFile({
          path: `runrace-${Date.now()}.png`,
          data: base64,
          directory: Directory.Cache,
        });
        const { Share } = await import("@capacitor/share");
        await Share.share({ files: [written.uri] });
      } else {
        // 웹: 바로 다운로드(폰/PC에 저장).
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "runrace.png";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
      void track("story_card_saved", { workoutType: data.workoutType });
    } catch (e) {
      // 저장 시트를 닫은 경우(AbortError)는 오류로 취급하지 않는다.
      if ((e as { name?: string })?.name !== "AbortError") {
        setError(t.share_card_error);
      }
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
      <Button
        variant="secondary"
        onClick={onSave}
        disabled={busy}
        className={triggerClassName ?? "h-11 w-full"}
      >
        {busy ? t.share_card_busy : `📸 ${t.share_card_create}`}
      </Button>
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}

      {/* 캡처 전용 오프스크린 카드 (1080×1920) — fixed라 문서 스크롤에 영향 없음 */}
      <div
        aria-hidden="true"
        style={{ position: "fixed", left: "-99999px", top: 0, pointerEvents: "none" }}
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
