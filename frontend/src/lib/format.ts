/** 화면 표시용 날짜/숫자 포맷 모음. (입력 폼용 날짜 계산은 challengeForm.ts 참고) */

/** ISO → 로캘 날짜(예: 2026. 6. 4.) */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

/** 시작~종료 날짜 구간. 종료가 없으면 "-". */
export function formatDateRange(startAt: string, endAt: string | null): string {
  return `${formatDate(startAt)} ~ ${endAt ? formatDate(endAt) : "-"}`;
}

/** ISO → 로캘 일시(전체). */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

/** ISO → "6월 4일 14:30" 류의 짧은 일시(운동 목록용). */
export function formatShortDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** ISO → date input 값(yyyy-MM-dd). */
export function toDateInputValue(iso: string): string {
  return iso.slice(0, 10);
}

/** 미터 → "1.23 km" 문자열(소수 2자리). */
export function formatKm(distanceM: number): string {
  return `${(distanceM / 1000).toFixed(2)} km`;
}
