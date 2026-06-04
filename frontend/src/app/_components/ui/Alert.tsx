import type { ReactNode } from "react";

export type AlertTone = "error" | "success" | "info" | "warning";

/** 톤별 배경/글자색. 모양(rounded-xl p-3 text-sm)은 공통. */
const TONE_CLASS: Record<AlertTone, string> = {
  error: "bg-red-50 text-red-700",
  success: "bg-green-50 text-green-800",
  info: "bg-emerald-50 text-emerald-800",
  warning: "bg-amber-50 text-amber-800",
};

/**
 * 페이지 곳곳에 반복되던 알림 배너. 여백은 충돌을 피하려고 baked-in 하지 않고
 * 호출부에서 className(mb-4 등)으로 넘긴다.
 */
export function Alert({
  tone = "error",
  className,
  children,
}: {
  tone?: AlertTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`rounded-xl p-3 text-sm ${TONE_CLASS[tone]}${className ? ` ${className}` : ""}`}>
      {children}
    </div>
  );
}
