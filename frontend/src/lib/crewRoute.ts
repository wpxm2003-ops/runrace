import { parsePositiveIntId, segmentIdFromPath, staticIdParam } from "@/lib/routeId";

export function crewDetailHref(id: number) {
  return `/crew/view?id=${id}`;
}

export function parseCrewId(value: string | null | undefined): number | null {
  return parsePositiveIntId(value);
}

/**
 * 정적 export용: 동적 라우트는 단일 템플릿 하나만 생성한다.
 * 실제 id는 클라이언트가 URL(usePathname)에서 읽고, nginx가 /crew/{숫자} 요청을
 * 이 템플릿(crew/view.html)으로 라우팅한다 → id 상한 없이 모든 크루 직접 접속 가능.
 */
export const CREW_ROUTE_TEMPLATE = "view";
export function crewStaticParamIds(): { id: string }[] {
  return staticIdParam(CREW_ROUTE_TEMPLATE);
}

/** /crew/{id} 경로명에서 크루 id를 파싱한다. */
export function parseCrewIdFromPath(pathname: string | null | undefined): number | null {
  return segmentIdFromPath(pathname, 2);
}
