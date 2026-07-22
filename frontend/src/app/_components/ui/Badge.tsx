import type { ReactNode } from "react";

const TONE_CLASSES = {
  amber: "bg-amber-100 text-amber-700",
  emerald: "bg-emerald-100 text-emerald-700",
} as const;

/** 리더/나/참여중/라이벌 같은 작은 뱃지 — 색만 다르고 모양은 전부 동일한 패턴을 공유한다. */
export function Badge({ tone, children }: { tone: keyof typeof TONE_CLASSES; children: ReactNode }) {
  return (
    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${TONE_CLASSES[tone]}`}>
      {children}
    </span>
  );
}
