"use client";

import { useEffect, useMemo, useState } from "react";
import { useNativeBack } from "@/lib/useNativeBack";
import { useLocale } from "@/lib/i18n";
import { pad2 } from "@/lib/format";
import { DrumCol, drumRange } from "@/app/_components/ui/DrumPicker";

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function parseValue(s: string) {
  if (!s || s.length < 16) return null;
  return {
    year: parseInt(s.slice(0, 4), 10),
    month: parseInt(s.slice(5, 7), 10),
    day: parseInt(s.slice(8, 10), 10),
    hour: parseInt(s.slice(11, 13), 10),
    minute: parseInt(s.slice(14, 16), 10),
  };
}

function formatDisplay(s: string): string {
  const p = parseValue(s);
  if (!p) return "";
  return `${p.year}. ${p.month}. ${p.day}.  ${pad2(p.hour)}:${pad2(p.minute)}`;
}

function buildValue(y: number, mo: number, d: number, h: number, mi: number): string {
  return `${y}-${pad2(mo)}-${pad2(d)}T${pad2(h)}:${pad2(mi)}`;
}

// ── static lists ─────────────────────────────────────────────────────────────
const NOW = new Date();
const YEAR_START = NOW.getFullYear();
const YEAR_END = YEAR_START + 3;
const YEARS = drumRange(YEAR_START, YEAR_END);
const MONTHS = drumRange(1, 12, (n) => String(n));
const HOURS = drumRange(0, 23, pad2);
const MINUTES = drumRange(0, 59, pad2);

// ── DateTimePickerSheet ──────────────────────────────────────────────────────
type Props = {
  value: string; // "yyyy-MM-ddTHH:mm" or ""
  onChange: (v: string) => void;
  /** 최소 허용 datetime-local 문자열. 없으면 현재 시각. */
  min?: string;
  label: string;
};

export function DateTimePickerSheet({ value, onChange, min, label }: Props) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(YEAR_START);
  const [month, setMonth] = useState(NOW.getMonth() + 1);
  const [day, setDay] = useState(NOW.getDate());
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);

  const days = useMemo(() => {
    const max = daysInMonth(year, month);
    return drumRange(1, max, (n) => String(n));
  }, [year, month]);

  useEffect(() => {
    const max = daysInMonth(year, month);
    if (day > max) setDay(max);
  }, [year, month, day]);

  useNativeBack(() => setOpen(false), open);

  function openSheet() {
    const p = parseValue(value);
    if (p && YEARS.includes(String(p.year))) {
      setYear(p.year);
      setMonth(p.month);
      setDay(p.day);
      setHour(p.hour);
      setMinute(p.minute);
    } else {
      // 값이 없거나 연도가 범위 밖이면 내일 09:00 기본값
      const d = new Date();
      d.setDate(d.getDate() + 1);
      setYear(YEAR_START);
      setMonth(d.getMonth() + 1);
      setDay(d.getDate());
      setHour(9);
      setMinute(0);
    }
    setOpen(true);
  }

  function confirm() {
    const result = buildValue(year, month, day, hour, minute);
    const now = new Date();
    const fallbackMin = buildValue(
      now.getFullYear(), now.getMonth() + 1, now.getDate(),
      now.getHours(), now.getMinutes(),
    );
    const effective = min ?? fallbackMin;

    if (result < effective) {
      // 과거 날짜 선택 시: 드럼을 최솟값으로 스냅하고 시트 유지 (유저가 보정 확인)
      const p = parseValue(effective);
      if (p) {
        setYear(p.year);
        setMonth(p.month);
        setDay(p.day);
        setHour(p.hour);
        setMinute(p.minute);
      }
      return;
    }

    onChange(result);
    setOpen(false);
  }

  const displayText = formatDisplay(value);

  return (
    <>
      <button
        type="button"
        onClick={openSheet}
        className="mt-2 h-11 w-full rounded-xl border border-zinc-200 px-3 text-left text-sm"
        style={{ color: displayText ? undefined : "#a1a1aa" }}
      >
        {displayText || label}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-[100] bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-x-0 bottom-0 z-[110] rounded-t-2xl bg-white px-4">
            <div className="py-3 text-center text-sm font-medium text-zinc-600">
              {label}
            </div>

            {/* drums */}
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
                width={36}
              />
              <DrumCol
                label={t.dtp_day}
                items={days}
                selectedIdx={Math.min(day - 1, days.length - 1)}
                onSelect={(i) => setDay(i + 1)}
                width={36}
              />
              <div className="mx-1 self-center text-zinc-200 text-lg">|</div>
              <DrumCol
                label={t.dtp_hour}
                items={HOURS}
                selectedIdx={hour}
                onSelect={(i) => setHour(i)}
                width={40}
              />
              <DrumCol
                label={t.dtp_minute}
                items={MINUTES}
                selectedIdx={minute}
                onSelect={(i) => setMinute(i)}
                width={40}
              />
            </div>

            {/* buttons */}
            <div className="mt-4 flex gap-3 pb-8">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-11 flex-1 rounded-xl border border-zinc-200 text-sm"
              >
                {t.cancel}
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
      )}
    </>
  );
}
