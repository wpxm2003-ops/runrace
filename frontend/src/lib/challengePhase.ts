// 단계 판정은 백엔드 ChallengePhase.java 가 권위 — API 값(challengePhaseFromApi)을 우선 사용하고,
// 아래 날짜 기반 계산(challengePhaseFromDates)은 API 값이 없거나 stale일 때의 폴백이다. 규칙 변경 시 양쪽 함께.
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

/**
 * 목록 API에서 받은 phase(apiPhase)를 우선 사용하되,
 * 캐시가 stale해서 시간이 지났음에도 apiPhase가 잘못된 경우(예: 이미 startAt을 지났는데 SCHEDULED)
 * 날짜 계산 결과로 보정한다.
 *
 * 예) 10:14에 페치 → apiPhase=SCHEDULED, startAt=10:16 → 10:16이 지나면 → "in_progress"로 보정
 */
export function resolveChallengePhase(
  startAt: string,
  endAt: string | null,
  apiPhase?: string | null,
): ChallengePhase {
  const fromApi = challengePhaseFromApi(apiPhase);
  if (fromApi === null) return challengePhaseFromDates(startAt, endAt);

  const fromDates = challengePhaseFromDates(startAt, endAt);

  // apiPhase가 SCHEDULED인데 현재 시간이 이미 startAt을 넘었으면 날짜 계산으로 보정
  if (fromApi === "scheduled" && fromDates !== "scheduled") return fromDates;

  // apiPhase가 IN_PROGRESS인데 현재 시간이 이미 endAt을 넘었으면 날짜 계산으로 보정
  if (fromApi === "in_progress" && fromDates === "ended") return fromDates;

  return fromApi;
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
