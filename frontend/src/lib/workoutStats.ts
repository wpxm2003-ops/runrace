import type { WorkoutListItem } from "@/lib/api/types";

export type WorkoutAggregate = {
  totalDistanceM: number;
  totalDurationSec: number;
  totalCalories: number;
  workoutCount: number;
  workoutDayCount: number;
  avgPaceSecPerKm: number | null;
};

/** 로컬 날짜 yyyy-MM-dd */
export function localDateKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function aggregateWorkouts(items: WorkoutListItem[]): WorkoutAggregate {
  let totalDistanceM = 0;
  let totalDurationSec = 0;
  let totalCalories = 0;
  const days = new Set<string>();

  for (const w of items) {
    totalDistanceM += w.distanceM;
    totalDurationSec += w.durationSec;
    totalCalories += w.calories;
    days.add(localDateKey(w.startedAt));
  }

  const avgPaceSecPerKm =
    totalDistanceM >= 10
      ? Math.round(totalDurationSec / (totalDistanceM / 1000))
      : null;

  return {
    totalDistanceM,
    totalDurationSec,
    totalCalories,
    workoutCount: items.length,
    workoutDayCount: days.size,
    avgPaceSecPerKm,
  };
}

export function filterWorkoutsByMonth(
  items: WorkoutListItem[],
  year: number,
  month: number,
): WorkoutListItem[] {
  return items.filter((w) => {
    const d = new Date(w.startedAt);
    return d.getFullYear() === year && d.getMonth() === month;
  });
}

export function workoutsOnDate(
  items: WorkoutListItem[],
  dateKey: string,
): WorkoutListItem[] {
  return items
    .filter((w) => localDateKey(w.startedAt) === dateKey)
    .sort(
      (a, b) =>
        new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
    );
}

export function workoutDateKeys(items: WorkoutListItem[]): Set<string> {
  return new Set(items.map((w) => localDateKey(w.startedAt)));
}

export type CalendarCell = { day: number | null; dateKey: string | null };

/** 일요일 시작 달력 그리드 */
export function buildCalendarCells(year: number, month: number): CalendarCell[] {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const pad = first.getDay();
  const cells: CalendarCell[] = [];

  for (let i = 0; i < pad; i++) {
    cells.push({ day: null, dateKey: null });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const m = String(month + 1).padStart(2, "0");
    const day = String(d).padStart(2, "0");
    cells.push({ day: d, dateKey: `${year}-${m}-${day}` });
  }
  return cells;
}

export function formatMonthLabel(year: number, month: number, locale: string): string {
  return new Date(year, month, 1).toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
  });
}

/** 기록 탭 월별 요약 제목 (예: 6월 요약) */
export function formatMonthSummaryTitle(month: number, locale: string): string {
  if (locale === "ko") {
    return `${month + 1}월 요약`;
  }
  const name = new Date(2000, month, 1).toLocaleDateString(locale, { month: "long" });
  return `${name} summary`;
}
