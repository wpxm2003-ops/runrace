"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useNativeBack } from "@/lib/useNativeBack";

// ── constants ───────────────────────────────────────────────────────────────
const ITEM_H = 44;
const VISIBLE = 5;
const PAD = Math.floor(VISIBLE / 2); // 2

// ── helpers ─────────────────────────────────────────────────────────────────
function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function range(from: number, to: number, fmt?: (n: number) => string): string[] {
  const out: string[] = [];
  for (let i = from; i <= to; i++) out.push(fmt ? fmt(i) : String(i));
  return out;
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

// ── Drum column ─────────────────────────────────────────────────────────────
function Drum({
  items,
  selectedIdx,
  onSelect,
  width,
}: {
  items: string[];
  selectedIdx: number;
  onSelect: (idx: number) => void;
  width: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const userScrolling = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mountedRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || userScrolling.current) return;
    if (!mountedRef.current) {
      el.scrollTop = selectedIdx * ITEM_H;
      mountedRef.current = true;
    } else {
      el.scrollTo({ top: selectedIdx * ITEM_H, behavior: "smooth" });
    }
  }, [selectedIdx]);

  function handleScroll() {
    userScrolling.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      userScrolling.current = false;
      const el = ref.current;
      if (!el) return;
      const idx = Math.max(
        0,
        Math.min(Math.round(el.scrollTop / ITEM_H), items.length - 1),
      );
      el.scrollTo({ top: idx * ITEM_H, behavior: "smooth" });
      onSelect(idx);
    }, 150);
  }

  return (
    <div className="relative" style={{ width }}>
      {/* selection highlight */}
      <div
        className="pointer-events-none absolute inset-x-0 rounded-lg bg-zinc-100"
        style={{ top: PAD * ITEM_H, height: ITEM_H }}
      />
      {/* fade top */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10"
        style={{
          height: PAD * ITEM_H,
          background:
            "linear-gradient(to bottom, rgba(255,255,255,0.95), rgba(255,255,255,0))",
        }}
      />
      {/* fade bottom */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10"
        style={{
          height: PAD * ITEM_H,
          background:
            "linear-gradient(to top, rgba(255,255,255,0.95), rgba(255,255,255,0))",
        }}
      />
      <div
        ref={ref}
        className="[&::-webkit-scrollbar]:hidden"
        style={{
          height: VISIBLE * ITEM_H,
          overflowY: "scroll",
          scrollSnapType: "y mandatory",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
        }}
        onScroll={handleScroll}
      >
        <div style={{ height: PAD * ITEM_H }} />
        {items.map((v, i) => (
          <div
            key={i}
            className="flex select-none items-center justify-center text-sm"
            style={{ height: ITEM_H, scrollSnapAlign: "center" }}
          >
            {v}
          </div>
        ))}
        <div style={{ height: PAD * ITEM_H }} />
      </div>
    </div>
  );
}

// ── Column with header ───────────────────────────────────────────────────────
function Col({
  label,
  items,
  selectedIdx,
  onSelect,
  width,
}: {
  label: string;
  items: string[];
  selectedIdx: number;
  onSelect: (idx: number) => void;
  width: number;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs text-zinc-400">{label}</span>
      <Drum items={items} selectedIdx={selectedIdx} onSelect={onSelect} width={width} />
    </div>
  );
}

// ── static lists ─────────────────────────────────────────────────────────────
const NOW = new Date();
const YEAR_START = NOW.getFullYear();
const YEAR_END = YEAR_START + 3;
const YEARS = range(YEAR_START, YEAR_END);
const MONTHS = range(1, 12, (n) => String(n));
const HOURS = range(0, 23, pad2);
const MINUTES = range(0, 59, pad2);

// ── DateTimePickerSheet ──────────────────────────────────────────────────────
type Props = {
  value: string; // "yyyy-MM-ddTHH:mm" or ""
  onChange: (v: string) => void;
  /** 최소 허용 datetime-local 문자열. 없으면 현재 시각. */
  min?: string;
  label: string;
};

export function DateTimePickerSheet({ value, onChange, min, label }: Props) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(YEAR_START);
  const [month, setMonth] = useState(NOW.getMonth() + 1);
  const [day, setDay] = useState(NOW.getDate());
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);

  const days = useMemo(() => {
    const max = daysInMonth(year, month);
    return range(1, max, (n) => String(n));
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
    // min 제약 적용: 선택 결과가 min보다 이르면 min 값으로 보정
    const minStr = min ?? buildValue(NOW.getFullYear(), NOW.getMonth() + 1, NOW.getDate(), NOW.getHours(), NOW.getMinutes());
    if (result < minStr) {
      onChange(minStr);
    } else {
      onChange(result);
    }
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
              <Col
                label="년"
                items={YEARS}
                selectedIdx={Math.max(0, YEARS.indexOf(String(year)))}
                onSelect={(i) => setYear(parseInt(YEARS[i], 10))}
                width={64}
              />
              <Col
                label="월"
                items={MONTHS}
                selectedIdx={month - 1}
                onSelect={(i) => setMonth(i + 1)}
                width={36}
              />
              <Col
                label="일"
                items={days}
                selectedIdx={Math.min(day - 1, days.length - 1)}
                onSelect={(i) => setDay(i + 1)}
                width={36}
              />
              <div className="mx-1 self-center text-zinc-200 text-lg">|</div>
              <Col
                label="시"
                items={HOURS}
                selectedIdx={hour}
                onSelect={(i) => setHour(i)}
                width={40}
              />
              <Col
                label="분"
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
                취소
              </button>
              <button
                type="button"
                onClick={confirm}
                className="h-11 flex-1 rounded-xl bg-emerald-500 text-sm font-medium text-white"
              >
                확인
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
