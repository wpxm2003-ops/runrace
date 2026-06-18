import type { WorkoutListItem } from "@/lib/api/types";

export type WorkoutAggregate = {
  totalDistanceM: number;
  totalDurationSec: number;
  totalCalories: number;
  workoutCount: number;
  workoutDayCount: number;
  avgPaceSecPerKm: number | null;
};

/** yyyy-MM-dd 키 (month는 1~12). */
function ymdKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** 로컬 날짜 yyyy-MM-dd */
export function localDateKey(iso: string): string {
  const d = new Date(iso);
  return ymdKey(d.getFullYear(), d.getMonth() + 1, d.getDate());
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

export type WeeklyComparison = {
  thisWeekDistanceM: number;
  lastWeekDistanceM: number;
  deltaM: number;
  thisWeekCount: number;
};

function getMondayOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d;
}

/** 이번 주(월~일)와 지난 주 거리 비교. `items`는 단일 연도 데이터여도 무방. */
export function weeklyComparison(items: WorkoutListItem[], today: Date): WeeklyComparison {
  const startOfThisWeek = getMondayOf(today);
  const startOfLastWeek = new Date(startOfThisWeek);
  startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

  let thisWeekDistanceM = 0;
  let lastWeekDistanceM = 0;
  let thisWeekCount = 0;

  for (const w of items) {
    const d = new Date(w.startedAt);
    if (d >= startOfThisWeek) {
      thisWeekDistanceM += w.distanceM;
      thisWeekCount++;
    } else if (d >= startOfLastWeek) {
      lastWeekDistanceM += w.distanceM;
    }
  }

  return {
    thisWeekDistanceM,
    lastWeekDistanceM,
    deltaM: thisWeekDistanceM - lastWeekDistanceM,
    thisWeekCount,
  };
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
    cells.push({ day: d, dateKey: ymdKey(year, month + 1, d) });
  }
  return cells;
}

export function formatMonthLabel(year: number, month: number, locale: string): string {
  return new Date(year, month, 1).toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
  });
}
