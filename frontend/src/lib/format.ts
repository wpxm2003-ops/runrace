/** 화면 표시용 날짜/숫자 포맷 모음. 날짜 순서는 locale를 따르고 시간은 24h로 고정한다.
 *  (입력 폼용 날짜 계산은 challengeForm.ts / toDateTimeInputValue 참고) */

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** 24h HH:mm */
function timeHm(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 24h HH:mm:ss */
function timeHms(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/** ISO → locale 순서의 숫자 날짜 (ko "2026. 06. 04.", en-US "06/04/2026", es "04/06/2026"). */
export function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/** ISO → locale 날짜 + 24h HH:mm */
export function formatDateTimeMinute(iso: string, locale: string): string {
  return `${formatDate(iso, locale)} ${timeHm(new Date(iso))}`;
}

/** 시작~종료 일시 구간. 종료가 없으면 "-". */
export function formatDateRange(
  startAt: string,
  endAt: string | null,
  locale: string,
): string {
  return `${formatDateTimeMinute(startAt, locale)} ~ ${endAt ? formatDateTimeMinute(endAt, locale) : "-"}`;
}

/** ISO → locale 날짜 + 24h HH:mm:ss */
export function formatDateTime(iso: string, locale: string): string {
  return `${formatDate(iso, locale)} ${timeHms(new Date(iso))}`;
}

/** ISO → datetime-local 값(yyyy-MM-ddTHH:mm). */
export function toDateTimeInputValue(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 미터 → "1.23 km" 문자열(소수 2자리). */
export function formatKm(distanceM: number): string {
  return `${(distanceM / 1000).toFixed(2)} km`;
}

/** km 숫자(문자열·숫자) → 소수 둘째 자리까지 표시. */
export function formatKmAmount(value: string | number): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return String(value);
  return n.toFixed(2);
}
