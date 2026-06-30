/** 동적 라우트 id 파싱·정적 파라미터 공통 유틸 (challenge/workout 공유). */

const POSITIVE_INT = /^\d+$/;

/** 양의 안전 정수 문자열만 number로, 아니면 null. */
export function parsePositiveIntId(value: string | null | undefined): number | null {
  if (!value || !POSITIVE_INT.test(value)) return null;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  return n;
}

/** 경로명의 index번째 세그먼트를 양의 정수 id로 파싱. (/x/{id}/... → index=2) */
export function segmentIdFromPath(
  pathname: string | null | undefined,
  index: number,
): number | null {
  return parsePositiveIntId(pathname?.split("/")[index] ?? null);
}

/** 정적 export용 단일 템플릿 파라미터. */
export function staticIdParam(template: string): { id: string }[] {
  return [{ id: template }];
}
