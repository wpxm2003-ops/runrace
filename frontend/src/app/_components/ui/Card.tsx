import type { ReactNode } from "react";

/**
 * 흰 카드(rounded-2xl bg-white shadow-sm). 패딩은 p-5/p-6 둘 중 하나라
 * Tailwind 충돌을 피하려고 discrete prop으로 받는다. 여백·추가 스타일은 className으로.
 */
export function Card({
  padding = "p-5",
  className,
  children,
}: {
  padding?: "p-5" | "p-6";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`rounded-2xl bg-white shadow-sm ${padding}${className ? ` ${className}` : ""}`}>
      {children}
    </div>
  );
}
