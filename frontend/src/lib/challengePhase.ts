export function challengePhaseLabel(startAt: string, endAt: string | null): string {
  const now = Date.now();
  const start = new Date(startAt).getTime();
  const end = endAt ? new Date(endAt).getTime() : start;
  if (now < start) return "예정";
  if (endAt && now > end) return "종료";
  return "진행중";
}

export function challengePhaseFromApi(phase: string | null | undefined): string | null {
  switch (phase) {
    case "SCHEDULED":
      return "예정";
    case "IN_PROGRESS":
      return "진행중";
    case "ENDED":
      return "종료";
    default:
      return null;
  }
}
