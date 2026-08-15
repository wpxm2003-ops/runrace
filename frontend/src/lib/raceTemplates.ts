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

function endOfDay(local: string): string {
  const date = new Date(local);
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
    return { startAt, endAt: endOfDay(startAt) };
  }
  if (key === "weekend10") {
    return { startAt, endAt: endOfWeekend(startAt) };
  }
  return { startAt, endAt: plusDaysLocal(startAt, 7) };
}
