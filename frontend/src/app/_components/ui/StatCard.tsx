import type { ReactNode } from "react";

/**
 * 라벨 + 값(tabular-nums)으로 구성된 스탯 카드.
 * 운동 4-스탯 그리드·집계 통계 등에서 공통으로 사용한다.
 * 크기 차이는 padding·valueClassName으로 조정한다.
 */
export function StatCard({
  label,
  value,
  padding = "p-4",
  valueClassName = "text-lg sm:text-xl",
  className,
}: {
  label: string;
  value: ReactNode;
  padding?: "p-3" | "p-4";
  valueClassName?: string;
  className?: string;
}) {
  return (
    <div
      className={`rounded-card border border-line bg-panel ${padding} shadow-card${className ? ` ${className}` : ""}`}
    >
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={`rr-number mt-1 font-bold text-ink ${valueClassName}`}>{value}</div>
    </div>
  );
}
