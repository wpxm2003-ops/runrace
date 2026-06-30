"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useNativeBack } from "@/lib/useNativeBack";

// ── constants ───────────────────────────────────────────────────────────────
const ITEM_H = 44;
const VISIBLE = 5;
const PAD = Math.floor(VISIBLE / 2); // 2 rows above/below center

// ── helpers ─────────────────────────────────────────────────────────────────
function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate(); // month 1-based
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
        className="pointer-events-none absolute inset-x-0.5 rounded-lg bg-zinc-100"
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

// ── static lists ─────────────────────────────────────────────────────────────
const NOW = new Date();
const YEAR_START = NOW.getFullYear() - 1;
const YEAR_END = NOW.getFullYear() + 2;
const YEARS = range(YEAR_START, YEAR_END);
const MONTHS = range(1, 12, String);
const HOURS = range(0, 23, pad2);
const MINUTES = range(0, 59, pad2);

// ── DateTimePickerSheet ──────────────────────────────────────────────────────
type Props = {
  value: string; // "yyyy-MM-ddTHH:mm" or ""
  onChange: (v: string) => void;
  label: string;
};

export function DateTimePickerSheet({ value, onChange, label }: Props) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(NOW.getFullYear());
  const [month, setMonth] = useState(NOW.getMonth() + 1);
  const [day, setDay] = useState(NOW.getDate());
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);

  const days = useMemo(() => {
    const max = daysInMonth(year, month);
    return range(1, max, String);
  }, [year, month]);

  // clamp day when month/year changes
  useEffect(() => {
    const max = daysInMonth(year, month);
    if (day > max) setDay(max);
  }, [year, month, day]);

  useNativeBack(() => setOpen(false), open);

  function openSheet() {
    const p = parseValue(value);
    if (p) {
      setYear(p.year);
      setMonth(p.month);
      setDay(p.day);
      setHour(p.hour);
      setMinute(p.minute);
    }
    setOpen(true);
  }

  function confirm() {
    onChange(buildValue(year, month, day, hour, minute));
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
          {/* backdrop */}
          <div
            className="fixed inset-0 z-[100] bg-black/40"
            onClick={() => setOpen(false)}
          />
          {/* sheet */}
          <div className="fixed inset-x-0 bottom-0 z-[110] rounded-t-2xl bg-white px-4">
            <div className="py-3 text-center text-sm font-medium text-zinc-600">
              {label}
            </div>

            {/* drum columns */}
            <div className="flex items-center justify-center gap-0.5">
              <Drum
                items={YEARS}
                selectedIdx={Math.max(0, YEARS.indexOf(String(year)))}
                onSelect={(i) => setYear(parseInt(YEARS[i], 10))}
                width={60}
              />
              <span className="shrink-0 px-0.5 text-xs text-zinc-400">년</span>
              <Drum
                items={MONTHS}
                selectedIdx={month - 1}
                onSelect={(i) => setMonth(i + 1)}
                width={40}
              />
              <span className="shrink-0 px-0.5 text-xs text-zinc-400">월</span>
              <Drum
                items={days}
                selectedIdx={Math.min(day - 1, days.length - 1)}
                onSelect={(i) => setDay(i + 1)}
                width={40}
              />
              <span className="shrink-0 px-0.5 text-xs text-zinc-400">일</span>
              <div className="w-4" />
              <Drum
                items={HOURS}
                selectedIdx={hour}
                onSelect={(i) => setHour(i)}
                width={44}
              />
              <span className="shrink-0 text-sm font-medium text-zinc-400">:</span>
              <Drum
                items={MINUTES}
                selectedIdx={minute}
                onSelect={(i) => setMinute(i)}
                width={44}
              />
            </div>

            {/* action buttons */}
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
