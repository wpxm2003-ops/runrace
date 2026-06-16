import type { ReactNode } from "react";

/** "**볼드**" 마커가 든 번역문을 <strong>으로 렌더한다. */
export function renderBold(text: string): ReactNode[] {
  return text.split("**").map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold text-zinc-900">
        {part}
      </strong>
    ) : (
      part
    ),
  );
}
