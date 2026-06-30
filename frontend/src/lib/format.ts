/** 화면 표시용 날짜/숫자 포맷 모음. 날짜 순서는 locale를 따르고 시간은 24h로 고정한다.
 *  (입력 폼용 날짜 계산은 challengeForm.ts / toDateTimeInputValue 참고) */

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Date → datetime-local 값(yyyy-MM-ddTHH:mm), 로컬 타임존 기준. 입력 폼 날짜의 단일 출처. */
export function toDateTimeLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * 요일 라벨 7개 (locale 기준). startMonday=true면 월요일 시작, 아니면 일요일 시작.
 * 매직 기준일을 한곳에 가둬 캘린더 헤더 표기를 통일한다.
 */
export function weekdayLabels(locale: string, startMonday = false): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: "short" });
  // 2023-01-01은 일요일. 월요일 시작이면 하루 밀어 2023-01-02(월)부터.
  const base = startMonday ? 2 : 1;
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2023, 0, base + i)));
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

/** ISO → 24h HH:mm:ss */
export function formatTimeHms(iso: string): string {
  return timeHms(new Date(iso));
}

/** ISO → "월 일 시:분" (짧은 월, 2자리 시각) — 기록 카드용. */
export function formatMonthDayTime(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 두 ISO 시각이 같은 로컬 날짜(연·월·일)인지. */
export function isSameLocalDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

/** ISO → datetime-local 값(yyyy-MM-ddTHH:mm). */
export function toDateTimeInputValue(iso: string): string {
  return toDateTimeLocal(new Date(iso));
}
