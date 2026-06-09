// 단계 판정은 백엔드 ChallengePhase.java 가 권위 — API 값(challengePhaseFromApi)을 우선 사용하고,
// 아래 날짜 기반 계산(challengePhaseFromDates)은 API 값이 없을 때의 폴백이다. 규칙 변경 시 양쪽 함께.
export type ChallengePhase = "scheduled" | "in_progress" | "ended";

export function challengePhaseFromDates(
  startAt: string,
  endAt: string | null,
): ChallengePhase {
  const now = Date.now();
  const start = new Date(startAt).getTime();
  const end = endAt ? new Date(endAt).getTime() : start;
  if (now < start) return "scheduled";
  if (endAt && now > end) return "ended";
  return "in_progress";
}

export function challengePhaseFromApi(
  phase: string | null | undefined,
): ChallengePhase | null {
  switch (phase) {
    case "SCHEDULED":
      return "scheduled";
    case "IN_PROGRESS":
      return "in_progress";
    case "ENDED":
      return "ended";
    default:
      return null;
  }
}

export function resolveChallengePhase(
  startAt: string,
  endAt: string | null,
  apiPhase?: string | null,
): ChallengePhase {
  return challengePhaseFromApi(apiPhase) ?? challengePhaseFromDates(startAt, endAt);
}

/** 예정·진행중·종료 상태 뱃지 색상 */
export function challengePhaseBadgeClass(phase: ChallengePhase): string {
  const base = "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold";
  switch (phase) {
    case "scheduled":
      return `${base} bg-sky-100 text-sky-800 ring-1 ring-sky-200/80`;
    case "in_progress":
      return `${base} bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200/80`;
    case "ended":
      return `${base} bg-zinc-200 text-zinc-600 ring-1 ring-zinc-300/80`;
  }
}
