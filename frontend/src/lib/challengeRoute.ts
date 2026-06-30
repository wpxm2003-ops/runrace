import { parsePositiveIntId, segmentIdFromPath, staticIdParam } from "@/lib/routeId";

export function challengeDetailHref(id: number) {
  return `/challenges/${id}`;
}

export function challengeEditHref(id: number) {
  return `/challenges/${id}/edit`;
}

export function parseChallengeId(value: string | null | undefined): number | null {
  return parsePositiveIntId(value);
}

/**
 * 정적 export용: 동적 라우트는 단일 템플릿 하나만 생성한다.
 * 실제 id는 클라이언트가 URL(usePathname)에서 읽고, nginx가 /challenges/{숫자} 요청을
 * 이 템플릿(challenges/view.html)으로 라우팅한다 → id 상한 없이 모든 레이스 직접 접속 가능.
 */
export const CHALLENGE_ROUTE_TEMPLATE = "view";
export function challengeStaticParamIds(): { id: string }[] {
  return staticIdParam(CHALLENGE_ROUTE_TEMPLATE);
}

/** /challenges/{id}[/...] 경로명에서 레이스 id를 파싱한다. */
export function parseChallengeIdFromPath(pathname: string | null | undefined): number | null {
  return segmentIdFromPath(pathname, 2);
}
