"use client";

import { useEffect, useRef } from "react";

/**
 * IntersectionObserver 기반 무한 스크롤.
 * 센티넬 엘리먼트가 뷰포트에 들어오면 다음 페이지를 로드한다.
 */
export function useInfiniteScroll({
  hasNext,
  isValidating,
  setSize,
  size,
}: {
  hasNext: boolean;
  isValidating: boolean;
  setSize: (fn: (s: number) => number) => void;
  size: number;
}): React.RefObject<HTMLDivElement | null> {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNext) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isValidating) {
          void setSize((s) => s + 1);
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNext, isValidating, setSize, size]);

  return sentinelRef;
}
