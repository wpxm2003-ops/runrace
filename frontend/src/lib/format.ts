/** 화면 표시용 날짜/숫자 포맷 모음. (입력 폼용 날짜 계산은 challengeForm.ts 참고) */

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** 로컬 시각 기준 yyyy/mm/dd */
function formatYmd(d: Date): string {
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;
}

/** 로컬 시각 기준 yyyy/mm/dd HH:mm */
function formatYmdHm(d: Date): string {
  return `${formatYmd(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 로컬 시각 기준 yyyy/mm/dd HH:mm:ss */
function formatYmdHms(d: Date): string {
  return `${formatYmd(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/** ISO → yyyy/mm/dd */
export function formatDate(iso: string): string {
  return formatYmd(new Date(iso));
}

/** ISO → yyyy/mm/dd HH:mm */
export function formatDateTimeMinute(iso: string): string {
  return formatYmdHm(new Date(iso));
}

/** 시작~종료 일시 구간. 종료가 없으면 "-". */
export function formatDateRange(startAt: string, endAt: string | null): string {
  return `${formatDateTimeMinute(startAt)} ~ ${endAt ? formatDateTimeMinute(endAt) : "-"}`;
}

/** ISO → yyyy/mm/dd HH:mm:ss */
export function formatDateTime(iso: string): string {
  return formatYmdHms(new Date(iso));
}

/** ISO → yyyy/mm/dd HH:mm:ss (기록 탭 시간 칩 등) */
export function formatShortDateTime(iso: string): string {
  return formatYmdHms(new Date(iso));
}

/** ISO → date input 값(yyyy-MM-dd). */
export function toDateInputValue(iso: string): string {
  return iso.slice(0, 10);
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
