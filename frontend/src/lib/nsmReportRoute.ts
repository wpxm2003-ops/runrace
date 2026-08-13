import { segmentIdFromPath, staticIdParam } from "@/lib/routeId";

/**
 * 정적 export용: 동적 라우트는 단일 템플릿 하나만 생성한다.
 * 실제 id는 클라이언트가 URL(usePathname)에서 읽고, nginx가 /training/report/{숫자}를
 * 이 템플릿으로 라우팅한다 → id 상한 없음. (workoutRoute.ts와 동일 패턴)
 */
export const NSM_REPORT_ROUTE_TEMPLATE = "view";
export function nsmReportStaticParamIds(): { id: string }[] {
  return staticIdParam(NSM_REPORT_ROUTE_TEMPLATE);
}

/** /training/report/{id} 경로명에서 블록(재측정) id를 파싱한다. */
export function parseNsmReportIdFromPath(pathname: string | null | undefined): number | null {
  return segmentIdFromPath(pathname, 3);
}

/** 블록 리포트 공유 링크(딥링크 대상). */
export function nsmReportHref(id: number): string {
  return `/training/report/${id}`;
}
