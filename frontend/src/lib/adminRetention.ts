import type { AdminRetentionCell } from "@/lib/api/admin";

/**
 * 관리자 재방문 지표 표시 규칙(순수 함수). 화면(/sb)과 테스트가 같은 규칙을 쓴다.
 */

/** 재방문율 칸 — "42% (5/12)". 판정 가능한 가입자가 없으면 null(0%로 보이면 안 된다). */
export function retentionRateLabel(cell: AdminRetentionCell): string | null {
  if (cell.eligible <= 0) return null;
  const percent = Math.round((cell.retained / cell.eligible) * 100);
  return `${percent}% (${cell.retained}/${cell.eligible})`;
}

/** 일평균 DAU — 소수 첫째 자리. 판정할 날이 없으면 null. */
export function averageLabel(value: number | null): string | null {
  if (value == null) return null;
  return value.toFixed(1);
}

/** yyyy-MM-dd 두 날짜 사이 일수(end − start). 시간대 영향을 받지 않게 UTC 자정으로 계산한다. */
function daysBetween(start: string, end: string): number {
  const toUtc = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(end) - toUtc(start)) / 86_400_000);
}

/**
 * 방문 수집 며칠째인지(수집 시작일이 1일째). 아직 수집 전이면 0.
 * WAU(7일)·MAU(30일) 창보다 짧으면 그 값은 부분값이다.
 */
export function visitCollectionDay(startDate: string | null, referenceDate: string): number {
  if (!startDate) return 0;
  return Math.max(0, daysBetween(startDate, referenceDate) + 1);
}

/** 가입 주(월~일) 라벨 — "11/16~11/22". */
export function cohortWeekLabel(weekStart: string, weekEnd: string): string {
  const short = (s: string) => {
    const [, m, d] = s.split("-");
    return `${Number(m)}/${Number(d)}`;
  };
  return `${short(weekStart)}~${short(weekEnd)}`;
}
