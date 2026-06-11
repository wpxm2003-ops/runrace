"use client";

import type { DistanceUnit } from "@/lib/units";

/**
 * km/mi 거리 단위 세그먼트 토글. 내정보·공유 페이지에서 공통으로 사용한다.
 * 라벨을 주면 i18n 텍스트로, 없으면 "km"/"mi" 원문으로 표시한다.
 */
export function UnitToggle({
  unit,
  onChange,
  size = "md",
  labels,
}: {
  unit: DistanceUnit;
  onChange: (u: DistanceUnit) => void;
  size?: "sm" | "md";
  labels?: Record<DistanceUnit, string>;
}) {
  const containerSize = size === "sm" ? " text-xs" : "";
  const buttonSize = size === "sm" ? "px-2 py-1" : "px-3 py-1.5 text-sm";
  const inactive = size === "sm" ? "text-zinc-500" : "text-zinc-600 hover:text-zinc-900";

  return (
    <div className={`inline-flex rounded-lg border border-zinc-200 p-0.5${containerSize}`}>
      {(["km", "mi"] as const).map((u) => (
        <button
          key={u}
          type="button"
          onClick={() => onChange(u)}
          className={`rounded-md font-medium ${buttonSize} ${
            unit === u ? "bg-zinc-900 text-white" : inactive
          }`}
        >
          {labels ? labels[u] : u}
        </button>
      ))}
    </div>
  );
}
