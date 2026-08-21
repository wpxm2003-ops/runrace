import { formatLocalDateTime, minStartAtLocal, plusDaysLocal } from "@/lib/challengeForm";

export type RaceTemplateKey = "today5" | "weekend10" | "week30";

export type RaceTemplate = {
  key: RaceTemplateKey;
  goalKm: number;
  accent: string;
};

export const RACE_TEMPLATES: RaceTemplate[] = [
  { key: "today5", goalKm: 5, accent: "START" },
  { key: "weekend10", goalKm: 10, accent: "WEEKEND" },
  { key: "week30", goalKm: 30, accent: "D-7" },
];

/**
 * 마감이 이만큼도 안 남았으면 다음 마감으로 넘긴다.
 *
 * <p>23:00 이후에 "오늘 자정까지"를 고르면 남는 시간이 몇 분뿐이고, 23:59에는
 * startAt과 endAt이 같아져 `endAfterStart`로 생성 자체가 막혔다. 만들 수 없는 카드를
 * 보여주느니 다음 마감으로 넘기는 편이 낫다.
 */
const MIN_TEMPLATE_WINDOW_MS = 60 * 60_000;

function tooShort(startAt: string, endAt: string): boolean {
  return new Date(endAt).getTime() - new Date(startAt).getTime() < MIN_TEMPLATE_WINDOW_MS;
}

function endOfDay(local: string, addDays = 0): string {
  const date = new Date(local);
  date.setDate(date.getDate() + addDays);
  date.setHours(23, 59, 0, 0);
  return formatLocalDateTime(date);
}

function endOfWeekend(local: string): string {
  const date = new Date(local);
  const daysUntilSunday = (7 - date.getDay()) % 7;
  date.setDate(date.getDate() + daysUntilSunday);
  date.setHours(23, 59, 0, 0);
  return formatLocalDateTime(date);
}

export function raceTemplateWindow(key: RaceTemplateKey, now = minStartAtLocal()) {
  const startAt = now;

  if (key === "today5") {
    const endAt = endOfDay(startAt);
    return { startAt, endAt: tooShort(startAt, endAt) ? endOfDay(startAt, 1) : endAt };
  }
  if (key === "weekend10") {
    const endAt = endOfWeekend(startAt);
    // 일요일 늦은 밤이면 이번 주말이 사실상 끝났으니 다음 주 일요일로 넘긴다.
    return { startAt, endAt: tooShort(startAt, endAt) ? plusDaysLocal(endAt, 7) : endAt };
  }
  return { startAt, endAt: plusDaysLocal(startAt, 7) };
}
