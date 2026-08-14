import type { ReactNode } from "react";

const TONE_CLASSES = {
  brand: "bg-brand-soft text-brand-pressed",
  amber: "bg-brand-soft text-brand-pressed",
  emerald: "bg-emerald-100 text-emerald-700",
  // 크루 전용 레이스 표시 — amber(리더/라이벌)와 헷갈리지 않게 더 어둡고 갈색에 가깝게.
  brown: "bg-brand-soft text-brand-pressed",
} as const;

/** 리더/나/참여중/라이벌/크루 같은 작은 뱃지 — 색만 다르고 모양은 전부 동일한 패턴을 공유한다. */
export function Badge({ tone, children }: { tone: keyof typeof TONE_CLASSES; children: ReactNode }) {
  return (
    <span className={`shrink-0 rounded-pill px-2 py-0.5 text-[10px] font-bold ${TONE_CLASSES[tone]}`}>
      {children}
    </span>
  );
}
