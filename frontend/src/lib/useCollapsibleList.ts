import { useState } from "react";

/**
 * 접기/펼치기 목록 상태 — 접힌 상태에선 앞에서 collapsedCount개만 보여준다
 * (서버가 정렬해 내려주는 목록이라 앞에서 자르면 곧 상위/최근이다).
 * hiddenCount가 0 이하면 호출부가 ShowMoreToggle을 렌더하지 않는다.
 */
export function useCollapsibleList<T>(
  items: T[],
  collapsedCount: number,
): { visible: T[]; hiddenCount: number; expanded: boolean; toggle: () => void } {
  const [expanded, setExpanded] = useState(false);
  const hiddenCount = items.length - collapsedCount;
  const visible = expanded ? items : items.slice(0, collapsedCount);
  return { visible, hiddenCount, expanded, toggle: () => setExpanded((v) => !v) };
}
