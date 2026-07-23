"use client";

import { useState } from "react";
import type { CrewInsights } from "@/lib/api/types";
import { monthDayLabel, pad2, todayIso, weekdayLabels } from "@/lib/format";
import { useLocale } from "@/lib/i18n";

type Cell = { date: string; runners: number; nicknames: (string | null)[]; future: boolean };

/**
 * 크루 잔디 — 이번 달(캘린더 월) 날짜별 뛴 멤버를 깃허브 잔디 스타일로.
 * 달마다 실제 일수·시작 요일이 달라 그리드 모양이 자연히 다르다(고정 롤링 윈도우가 아님).
 * 1일 앞은 요일 정렬을 위한 빈 칸(달력처럼)이고, 주 수는 4~6주로 가변이다.
 * 모바일(WebView)엔 호버가 없으므로 칸을 탭하면 그리드 아래에 날짜·뛴 멤버 닉네임을 보여준다.
 */
export function HeatmapGrid({ insights }: { insights: CrewInsights }) {
  const { t, locale } = useLocale();
  const [selected, setSelected] = useState<string | null>(null);
  const byDate = new Map((insights.heatmap ?? []).map((d) => [d.date, d]));
  const today = todayIso();
  const weekdays = weekdayLabels(locale, true);

  // heatmapFrom = 이번 달 1일. 요일 정렬용 선행 빈 칸 + 실제 일수를 7의 배수로 맞춘다.
  const [y, m] = insights.heatmapFrom.split("-").map(Number);
  const firstWeekday = (new Date(y, m - 1, 1).getDay() + 6) % 7; // Mon=0…Sun=6
  const daysInMonth = new Date(y, m, 0).getDate();
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

  const cells: (Cell | null)[] = Array.from({ length: totalCells }, (_, i) => {
    const dayNum = i - firstWeekday + 1;
    if (dayNum < 1 || dayNum > daysInMonth) {
      return null; // 이번 달 밖 — 달력 정렬용 빈 칸(전월 말·다음달 초)
    }
    const date = `${y}-${pad2(m)}-${pad2(dayNum)}`;
    const day = byDate.get(date);
    return {
      date,
      runners: day?.runners ?? 0,
      nicknames: day?.nicknames ?? [],
      future: date > today,
    };
  });

  function cellClass(runners: number): string {
    if (runners === 0 || insights.memberCount === 0) return "bg-zinc-100";
    const ratio = runners / insights.memberCount;
    if (ratio <= 1 / 3) return "bg-emerald-200";
    if (ratio <= 2 / 3) return "bg-emerald-400";
    return "bg-emerald-600";
  }

  const selectedCell = selected ? (cells.find((c) => c?.date === selected) ?? null) : null;
  // 서버가 최대 10명까지만 보내므로 넘치는 인원은 "외 n명"으로 표기
  const overflow = selectedCell ? selectedCell.runners - selectedCell.nicknames.length : 0;

  return (
    <div>
      <div className="mb-1 grid grid-cols-7 gap-1">
        {weekdays.map((w) => (
          <div key={w} className="text-center text-[10px] text-zinc-400">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((c, i) =>
          !c || c.future ? (
            <div key={c?.date ?? `blank-${i}`} className="h-5 rounded bg-transparent" />
          ) : (
            <button
              key={c.date}
              type="button"
              title={`${monthDayLabel(c.date, locale)} · ${c.runners}`}
              aria-label={`${monthDayLabel(c.date, locale)} · ${c.runners}`}
              onClick={() => setSelected((prev) => (prev === c.date ? null : c.date))}
              className={`h-5 rounded transition-shadow ${cellClass(c.runners)} ${
                selected === c.date ? "ring-2 ring-zinc-900 ring-offset-1" : ""
              }`}
            />
          ),
        )}
      </div>
      <p className="mt-2.5 text-xs leading-relaxed text-zinc-500">
        {selectedCell ? (
          <>
            <span className="font-semibold text-zinc-900">
              {monthDayLabel(selectedCell.date, locale)}
            </span>
            {" · "}
            {selectedCell.runners === 0 ? (
              <span>{t.crew_no_record_yet}</span>
            ) : (
              <span className="font-medium text-emerald-700">
                {selectedCell.nicknames.filter(Boolean).join(", ")}
                {overflow > 0 ? ` ${t.crew_heatmap_more(overflow)}` : ""}
              </span>
            )}
          </>
        ) : (
          <span className="text-zinc-400">{t.crew_heatmap_tap_hint}</span>
        )}
      </p>
    </div>
  );
}
