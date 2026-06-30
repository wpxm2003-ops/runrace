"use client";

import { useRef, useState } from "react";
import { Button } from "@/app/_components/ui/Button";
import { formatDate } from "@/lib/format";
import { RoutePath, type PathPoint } from "@/lib/routePath";
import { formatDistance, formatPace, type DistanceUnit } from "@/lib/units";
import { formatDuration } from "@/lib/workoutTrack";
import { track } from "@/lib/analytics";
import { CARD_W, CARD_H, captureAndSaveCard } from "@/lib/storyCard";
import type { Translations } from "@/lib/i18n/translations";

/** 카드 렌더에 필요한 최소 필드 — 운동 상세/공유 응답 모두와 호환. */
type CardData = {
  distanceM: number;
  durationSec: number;
  calories: number;
  startedAt: string;
  workoutType: "GPS" | "INDOOR";
  path: PathPoint[];
};

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
      const result = await captureAndSaveCard(node, "runrace");
      if (result === "saved") void track("story_card_saved", { workoutType: data.workoutType });
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
              <RoutePath
                path={data.path}
                width={880}
                height={600}
                padding={90}
                strokeWidths={[40, 20, 9]}
                startRadius={15}
                endRadius={17}
                endStrokeWidth={8}
                svgProps={{ width: "100%", height: "100%", "aria-hidden": true }}
              />
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
