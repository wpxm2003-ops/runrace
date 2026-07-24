import { pad2 } from "./format";

/** 캘린더 월 그리드의 한 칸. null은 요일 정렬용 빈 칸(이번 달 밖 — 전월 말·다음달 초). */
export type CalendarDayCell = { date: string; future: boolean };

/**
 * "YYYY-MM-…" 월 기준일로 캘린더 월 그리드 셀을 만든다(크루 잔디 등).
 * 일요일 시작(일반 달력 관례)이고 총 칸 수는 7의 배수(4~6주 가변).
 * 이번 달 안이지만 today 이후인 날짜는 future로 표시한다(렌더는 하되 상호작용 차단용).
 */
export function monthCalendarCells(
  monthIso: string,
  today: string,
): (CalendarDayCell | null)[] {
  const [y, m] = monthIso.split("-").map(Number);
  const firstWeekday = new Date(y, m - 1, 1).getDay(); // Sun=0…Sat=6
  const daysInMonth = new Date(y, m, 0).getDate();
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  return Array.from({ length: totalCells }, (_, i) => {
    const dayNum = i - firstWeekday + 1;
    if (dayNum < 1 || dayNum > daysInMonth) return null;
    const date = `${y}-${pad2(m)}-${pad2(dayNum)}`;
    return { date, future: date > today };
  });
}
