"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * 단일 템플릿이 모든 id로 서빙되는 동적 라우트에서 실제 URL의 id를 읽는다.
 * - 서버/클라 초기 렌더는 null로 일치 → 하이드레이션 미스매치 방지
 * - 마운트 후(또는 경로 변경 시) window.location.pathname에서 실제 id를 채운다
 * parse는 모듈 레벨 함수(안정적 참조)를 넘긴다.
 */
export function useRouteId(parse: (pathname: string) => number | null): number | null {
  const pathname = usePathname();
  const [id, setId] = useState<number | null>(null);
  useEffect(() => {
    setId(parse(window.location.pathname));
  }, [pathname, parse]);
  return id;
}
