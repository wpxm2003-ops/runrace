"use client";

import { useEffect, useRef } from "react";

/**
 * 네이티브 `<select>` 대신 쓰는 스크롤 드럼(년/월/일/시/분 등 숫자 컬럼 선택).
 * docs/frontend-ui-guidelines.md 참고 — Android WebView에서 네이티브 select가
 * 깨지는 문제를 피하기 위한 커스텀 패턴. DateTimePickerSheet/DatePickerSheet가 공유.
 */
const ITEM_H = 44;
const VISIBLE = 5;
const PAD = Math.floor(VISIBLE / 2); // 2

export function drumRange(from: number, to: number, fmt?: (n: number) => string): string[] {
  const out: string[] = [];
  for (let i = from; i <= to; i++) out.push(fmt ? fmt(i) : String(i));
  return out;
}

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
        className="relative [&::-webkit-scrollbar]:hidden"
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

/** 라벨 + 드럼 한 컬럼. */
export function DrumCol({
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
