"use client";

import { useEffect, useMemo, useState } from "react";
import { useNativeBack } from "@/lib/useNativeBack";
import { useLocale } from "@/lib/i18n";
import { pad2, todayIso } from "@/lib/format";
import { DrumCol, drumRange } from "./DrumPicker";

/**
 * 과거 날짜 하나(연/월/일)를 고르는 드럼 시트 — 네이티브 `<select>`/`<input type="date">`
 * 대신 쓴다(docs/frontend-ui-guidelines.md). DateTimePickerSheet(미래 일정용, 시/분 포함)와
 * 드럼 자체는 공유하되, 값 형식(date-only)·허용 범위(미래 금지)가 반대라 별도 컴포넌트로 둔다.
 */
function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function parseDateOnly(s: string) {
  if (!s || s.length < 10) return null;
  return {
    year: parseInt(s.slice(0, 4), 10),
    month: parseInt(s.slice(5, 7), 10),
    day: parseInt(s.slice(8, 10), 10),
  };
}

function buildDateOnly(y: number, mo: number, d: number): string {
  return `${y}-${pad2(mo)}-${pad2(d)}`;
}

type Props = {
  /** "yyyy-MM-dd" 또는 "" (미선택). */
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder: string;
  /** 드럼에 보여줄 첫 연도. 기본 올해-30년. */
  yearStart?: number;
};

export function DatePickerSheet({ value, onChange, label, placeholder, yearStart }: Props) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const today = useMemo(() => parseDateOnly(todayIso())!, []);
  const YEAR_END = today.year;
  const YEAR_START = yearStart ?? YEAR_END - 30;
  const YEARS = useMemo(() => drumRange(YEAR_START, YEAR_END), [YEAR_START, YEAR_END]);
  const MONTHS = useMemo(() => drumRange(1, 12), []);

  const [year, setYear] = useState(YEAR_END);
  const [month, setMonth] = useState(today.month);
  const [day, setDay] = useState(today.day);

  const days = useMemo(() => drumRange(1, daysInMonth(year, month)), [year, month]);

  useEffect(() => {
    const max = daysInMonth(year, month);
    if (day > max) setDay(max);
  }, [year, month, day]);

  useNativeBack(() => setOpen(false), open);

  function openSheet() {
    const p = parseDateOnly(value);
    if (p && p.year >= YEAR_START && p.year <= YEAR_END) {
      setYear(p.year);
      setMonth(p.month);
      setDay(p.day);
    } else {
      setYear(YEAR_END);
      setMonth(today.month);
      setDay(today.day);
    }
    setOpen(true);
  }

  function confirm() {
    const result = buildDateOnly(year, month, day);
    const todayStr = buildDateOnly(YEAR_END, today.month, today.day);
    if (result > todayStr) {
      // 미래로 스크롤했으면 오늘로 스냅하고 시트는 유지(유저가 보정 확인).
      setYear(YEAR_END);
      setMonth(today.month);
      setDay(today.day);
      return;
    }
    onChange(result);
    setOpen(false);
  }

  function clear() {
    onChange("");
    setOpen(false);
  }

  const p = parseDateOnly(value);
  const displayText = p ? `${p.year}. ${p.month}. ${p.day}.` : "";

  return (
    <>
      <button
        type="button"
        onClick={openSheet}
        className="mt-1.5 flex w-full items-center justify-between rounded-lg border border-zinc-300 bg-white px-3 py-2 text-left text-sm"
      >
        <span style={{ color: displayText ? undefined : "#a1a1aa" }}>{displayText || placeholder}</span>
        <span className="text-zinc-400">▾</span>
      </button>

      {open ? (
        <>
          <div
            className="fixed inset-0 z-[110] bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-x-0 bottom-0 z-[120] rounded-t-2xl bg-white px-4">
            <div className="py-3 text-center text-sm font-medium text-zinc-600">{label}</div>

            <div className="flex items-start justify-center gap-2">
              <DrumCol
                label={t.dtp_year}
                items={YEARS}
                selectedIdx={Math.max(0, YEARS.indexOf(String(year)))}
                onSelect={(i) => setYear(parseInt(YEARS[i], 10))}
                width={64}
              />
              <DrumCol
                label={t.dtp_month}
                items={MONTHS}
                selectedIdx={month - 1}
                onSelect={(i) => setMonth(i + 1)}
                width={44}
              />
              <DrumCol
                label={t.dtp_day}
                items={days}
                selectedIdx={Math.min(day - 1, days.length - 1)}
                onSelect={(i) => setDay(i + 1)}
                width={44}
              />
            </div>

            <div className="mt-4 flex gap-3 pb-8">
              <button
                type="button"
                onClick={clear}
                className="h-11 flex-1 rounded-xl border border-zinc-200 text-sm"
              >
                {t.crew_profile_founded_clear}
              </button>
              <button
                type="button"
                onClick={confirm}
                className="h-11 flex-1 rounded-xl bg-emerald-500 text-sm font-medium text-white"
              >
                {t.confirm}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
