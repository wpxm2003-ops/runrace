const CHALLENGE_ID_PATTERN = /^\d+$/;

export function challengeDetailHref(id: number) {
  return `/challenges/${id}`;
}

export function challengeEditHref(id: number) {
  return `/challenges/${id}/edit`;
}

export function parseChallengeIdFromQuery(value: string | null): number | null {
  return parseChallengeId(value);
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
