"use client";

import type { ReactNode } from "react";

/**
 * 선택 항목용 아코디언 행.
 * active=true → 초록 ✓ 아이콘 (값/항목 있음)
 * open=true  → children 표시
 */
export function AccordionRow({
  label,
  active,
  open,
  onToggle,
  children,
}: {
  label: string;
  active: boolean;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2.5 py-1 text-left"
      >
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold leading-none ${
            active
              ? "bg-emerald-500 text-white"
              : "border border-zinc-300 text-zinc-400"
          }`}
        >
          {active ? "✓" : "+"}
        </span>
        <span
          className={`text-sm font-medium ${active ? "text-zinc-900" : "text-zinc-600"}`}
        >
          {label}
        </span>
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}
