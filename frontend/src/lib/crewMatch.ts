/** 크루 대항전 계산 유틸 — 스코어 카드(크루 홈 섹션)와 대결 상세 페이지가 공유한다. */

/** 종료 시각까지 남은 일수(올림, 최소 0) — "D-n" 표기용. */
export function daysLeft(endAt: string): number {
  return Math.max(0, Math.ceil((new Date(endAt).getTime() - Date.now()) / 86_400_000));
}

/** 비율 바에 쓰는 내 크루 점유율(%). 합이 0이면 50(양쪽 균형)으로 표시한다. */
export function matchSharePercent(mine: number, theirs: number): number {
  const total = mine + theirs;
  return total === 0 ? 50 : Math.round((mine / total) * 100);
}
