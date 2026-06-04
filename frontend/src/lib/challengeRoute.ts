const CHALLENGE_ID_PATTERN = /^\d+$/;

export function challengeDetailHref(id: number) {
  return `/challenges/${id}`;
}

export function challengeEditHref(id: number) {
  return `/challenges/${id}/edit`;
}

/** 레이스 참여자 운동 상세 (기록 상세 + challenge 쿼리) */
export function challengeWorkoutHref(challengeId: number, workoutId: number) {
  return `/workouts/${workoutId}?challenge=${challengeId}`;
}

export function parseChallengeIdFromQuery(value: string | null): number | null {
  return parseChallengeId(value);
}

export function challengeShareUrl(id: number) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/challenges/${id}`;
}

export function parseChallengeId(value: string | null | undefined): number | null {
  if (!value || !CHALLENGE_ID_PATTERN.test(value)) return null;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  return n;
}

/** 정적 export용: 빌드 시 미리 생성할 id 목록 (1~500) */
export function challengeStaticParamIds(): { id: string }[] {
  return Array.from({ length: 500 }, (_, i) => ({ id: String(i + 1) }));
}
