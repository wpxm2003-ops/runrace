const WORKOUT_ID_PATTERN = /^\d+$/;

export function parseWorkoutId(value: string | null | undefined): number | null {
  if (!value || !WORKOUT_ID_PATTERN.test(value)) return null;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  return n;
}

/**
 * 정적 export용: 동적 라우트는 단일 템플릿 하나만 생성한다.
 * 실제 id는 클라이언트가 URL(usePathname)에서 읽고, nginx가 /workouts/{숫자}[/share]를
 * 이 템플릿으로 라우팅한다 → id 상한 없음.
 */
export const WORKOUT_ROUTE_TEMPLATE = "view";
export function workoutStaticParamIds(): { id: string }[] {
  return [{ id: WORKOUT_ROUTE_TEMPLATE }];
}

/** /workouts/{id}[/...] 경로명에서 운동 id를 파싱한다. */
export function parseWorkoutIdFromPath(pathname: string | null | undefined): number | null {
  return parseWorkoutId(pathname?.split("/")[2] ?? null);
}
