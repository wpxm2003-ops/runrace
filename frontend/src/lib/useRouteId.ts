"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

/**
 * 단일 템플릿이 모든 id로 서빙되는 동적 라우트에서 실제 URL의 id를 읽는다.
 *
 * useSyncExternalStore를 사용하는 이유:
 * - 서버/정적 생성 스냅샷 → null (하이드레이션 미스매치 방지)
 * - 클라이언트 스냅샷 → 렌더 단계에서 즉시 파싱 (useEffect tick 없음)
 * - 기존 useState+useEffect 방식은 id=null로 첫 렌더 후 paint가 발생한 뒤에야
 *   effect가 실행되어 SWR fetch가 한 틱 늦게 시작됐다.
 */
export function useRouteId(parse: (pathname: string) => number | null): number | null {
  const pathname = usePathname();

  return useSyncExternalStore(
    () => () => {},              // 별도 구독 불필요 — pathname 변경이 리렌더를 유발
    () => parse(pathname),       // 클라이언트: 렌더 시점에 즉시 파싱
    () => null,                  // 서버/정적 생성: null
  );
}
