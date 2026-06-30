"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { formatDistance } from "@/lib/units";
import type { DistanceUnit } from "@/lib/units";
import { formatDuration } from "@/lib/workoutTrack";
import { track } from "@/lib/analytics";
import { CARD_W, CARD_H, captureAndSaveCard } from "@/lib/storyCard";
import type { Translations } from "@/lib/i18n/translations";

/**
 * 월별 결산 인스타 스토리 카드(1080×1920). 캡처/저장은 lib/storyCard의 공용 로직을 사용한다.
 * 거리 히어로 + 횟수·최장 연속·시간 보조 스탯.
 */
const COLOR = {
  gray: "#7E828B",
  green: "#34D399",
  divider: "#1F2127",
  date: "#FFFFFF",
  footer: "#5C606A",
};

const FONT =
  'ui-sans-serif, system-ui, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

export function MonthlyRecapCard({
  monthName,
  year,
  month,
  activeDays,
  weekdayLabels,
  distanceM,
  runCount,
  durationSec,
  longestStreak,
  unit,
  t,
}: {
  monthName: string;
  year: number;
  month: number; // 0-based
  activeDays: number[]; // 운동한 날짜(1~31)
  weekdayLabels: string[]; // 일요일 시작 7개 요일 라벨
  distanceM: number;
  runCount: number;
  durationSec: number;
  longestStreak: number;
  unit: DistanceUnit;
  t: Translations;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  const [distVal, distUnit] = formatDistance(distanceM, unit).split(" ");
  const stats: [string, string][] = [
    [t.recap_runs_label, t.stats_count_unit(runCount)],
    [t.recap_streak_label, t.recap_days(longestStreak)],
    [t.recap_time_label, formatDuration(durationSec)],
  ];

  // 월간 캘린더 그리드 — 운동한 날은 초록, 안 한 날은 어둡게. 빈 칸은 투명.
  const activeSet = new Set(activeDays);
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  async function onSave() {
    const node = cardRef.current;
    if (!node) return;
    setBusy(true);
    try {
      const result = await captureAndSaveCard(node, "runrace-recap");
      if (result === "saved") void track("recap_card_saved");
    } catch (e) {
      if ((e as { name?: string })?.name !== "AbortError") {
        toast.error(t.share_card_error);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={onSave}
        disabled={busy}
        className="flex h-8 shrink-0 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
          <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {busy ? t.share_card_busy : t.recap_share}
      </button>

      {/* 캡처 전용 오프스크린 카드 (1080×1920) */}
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
            padding: "120px 100px 90px",
            background: "linear-gradient(180deg, #0B0C10 0%, #17191F 100%)",
            color: "#FFFFFF",
            fontFamily: FONT,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* 월 결산 타이틀 */}
          <div style={{ fontSize: 64, fontWeight: 700, letterSpacing: -1 }}>
            {t.recap_title(monthName)}
          </div>

          {/* 거리 히어로 */}
          <div style={{ marginTop: 80 }}>
            <div style={{ fontSize: 42, color: COLOR.gray, letterSpacing: 1 }}>
              {t.recap_distance_label}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 24, marginTop: 14 }}>
              <div style={{ fontSize: 230, fontWeight: 800, lineHeight: 1, letterSpacing: -4 }}>
                {distVal}
              </div>
              <div style={{ fontSize: 96, fontWeight: 700, color: COLOR.green }}>{distUnit}</div>
            </div>
          </div>

          <div style={{ flex: 1 }} />

          {/* 월간 캘린더 — 운동한 날 하이라이트 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* 요일 헤더 — 캘린더로 인식되도록 */}
            <div style={{ display: "flex", gap: 16, marginBottom: 2 }}>
              {weekdayLabels.map((w, i) => (
                <div
                  key={i}
                  style={{ width: 100, textAlign: "center", fontSize: 34, color: COLOR.gray }}
                >
                  {w}
                </div>
              ))}
            </div>
            {weeks.map((week, wi) => (
              <div key={wi} style={{ display: "flex", gap: 16 }}>
                {week.map((day, di) => (
                  <div
                    key={di}
                    style={{
                      width: 100,
                      height: 100,
                      borderRadius: 22,
                      background:
                        day == null
                          ? "transparent"
                          : activeSet.has(day)
                            ? COLOR.green
                            : "#1A1C22",
                    }}
                  />
                ))}
              </div>
            ))}
          </div>

          <div style={{ flex: 1 }} />

          {/* 보조 스탯 — 횟수 / 최장 연속 / 시간 */}
          <div
            style={{
              paddingTop: 70,
              borderTop: `1px solid ${COLOR.divider}`,
              display: "flex",
            }}
          >
            {stats.map(([label, value]) => (
              <div key={label} style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: 40, color: COLOR.gray }}>{label}</div>
                <div style={{ fontSize: 80, fontWeight: 600, marginTop: 18 }}>{value}</div>
              </div>
            ))}
          </div>

          {/* 푸터 */}
          <div style={{ marginTop: 90, display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: COLOR.green }} />
            <div style={{ fontSize: 40, color: COLOR.footer }}>runrace.co.kr</div>
          </div>
        </div>
      </div>
    </>
  );
}
