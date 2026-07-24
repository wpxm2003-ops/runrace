"use client";

import { useState } from "react";
import type { CrewInsights } from "@/lib/api/types";
import { monthCalendarCells } from "@/lib/calendarGrid";
import { monthDayLabel, todayIso, weekdayLabels } from "@/lib/format";
import { useLocale } from "@/lib/i18n";

type Cell = { date: string; runners: number; nicknames: (string | null)[]; future: boolean };

/**
 * 크루 잔디 — 이번 달(캘린더 월) 날짜별 뛴 멤버를 깃허브 잔디 스타일로.
 * 달마다 실제 일수·시작 요일이 달라 그리드 모양이 자연히 다르다(고정 롤링 윈도우가 아님).
 * 1일 앞은 요일 정렬을 위한 빈 칸(일요일 시작, 일반 달력 관례)이고, 주 수는 4~6주로 가변이다.
 * 이번 달의 미래 날짜도 회색 칸으로 처음부터 다 보여준다(31일이면 31칸 전부) — 아직 안 지난
 * 날만 눌러도 아무 의미가 없으니 클릭만 막는다(숨기면 달 모양이 날짜가 지날 때마다 자라 보임).
 * 모바일(WebView)엔 호버가 없으므로 칸을 탭하면 그리드 아래에 날짜·뛴 멤버 닉네임을 보여준다.
 */
export function HeatmapGrid({ insights }: { insights: CrewInsights }) {
  const { t, locale } = useLocale();
  const [selected, setSelected] = useState<string | null>(null);
  const byDate = new Map((insights.heatmap ?? []).map((d) => [d.date, d]));
  const today = todayIso();
  const weekdays = weekdayLabels(locale);

  // heatmapFrom = 이번 달 1일. 그리드 모양 계산(일요일 시작·7의 배수 칸)은 lib으로 추출됨.
  const cells: (Cell | null)[] = monthCalendarCells(insights.heatmapFrom, today).map((c) => {
    if (!c) return null;
    const day = byDate.get(c.date);
    return { ...c, runners: day?.runners ?? 0, nicknames: day?.nicknames ?? [] };
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
          !c ? (
            // 이번 달 밖(달력 정렬용 빈 칸) — 진짜로 안 보이게
            <div key={`blank-${i}`} className="h-5 rounded bg-transparent" />
          ) : c.future ? (
            // 이번 달 안이지만 아직 안 지난 날 — 칸은 처음부터 다 보이되 누를 수는 없게
            <div key={c.date} className="h-5 rounded bg-zinc-100" aria-hidden="true" />
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
