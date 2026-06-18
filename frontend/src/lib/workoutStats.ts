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

// ── 통계 패널용 ───────────────────────────────────────────────────────

/** 요일별 운동 횟수 (Mon=0 … Sun=6, ISO 순서). */
export function dayOfWeekDistribution(items: WorkoutListItem[]): number[] {
  const counts = new Array(7).fill(0);
  for (const w of items) {
    const day = new Date(w.startedAt).getDay(); // 0=Sun
    counts[day === 0 ? 6 : day - 1]++;
  }
  return counts;
}

export type MonthComparisonResult = {
  thisDist: number;
  thisCount: number;
  prevDist: number;
  prevCount: number;
};

/** 이번 달 vs 지난 달. prevYearItems는 1월 비교 시 전년도 데이터. */
export function monthComparison(
  yearItems: WorkoutListItem[],
  prevYearItems: WorkoutListItem[],
  year: number,
  month: number,
): MonthComparisonResult {
  const thisItems = filterWorkoutsByMonth(yearItems, year, month);
  const isJan = month === 0;
  const prevItems = isJan
    ? filterWorkoutsByMonth(prevYearItems, year - 1, 11)
    : filterWorkoutsByMonth(yearItems, year, month - 1);
  return {
    thisDist: thisItems.reduce((s, w) => s + w.distanceM, 0),
    thisCount: thisItems.length,
    prevDist: prevItems.reduce((s, w) => s + w.distanceM, 0),
    prevCount: prevItems.length,
  };
}

export type StreakResult = { current: number; longest: number };

/** 연속 운동일 (today 기준). yearItems만으로 계산 — 전년도 스트릭은 미반영. */
export function computeStreak(items: WorkoutListItem[], today: Date): StreakResult {
  if (items.length === 0) return { current: 0, longest: 0 };

  const dateSet = new Set(items.map((w) => localDateKey(w.startedAt)));

  // 오늘 또는 어제부터 역으로 연속일 카운트
  const todayKey = localDateKey(today.toISOString());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayKey = localDateKey(yesterday.toISOString());

  let current = 0;
  const startDate = dateSet.has(todayKey) ? new Date(today) : dateSet.has(yesterdayKey) ? yesterday : null;
  if (startDate) {
    const check = new Date(startDate);
    while (dateSet.has(localDateKey(check.toISOString()))) {
      current++;
      check.setDate(check.getDate() - 1);
    }
  }

  // 전체 기록에서 최장 연속일
  const sorted = Array.from(dateSet).sort();
  let longest = 1;
  let streak = 1;
  for (let i = 1; i < sorted.length; i++) {
    const a = new Date(sorted[i - 1] + "T12:00:00");
    const b = new Date(sorted[i] + "T12:00:00");
    if (Math.round((b.getTime() - a.getTime()) / 86_400_000) === 1) {
      streak++;
      if (streak > longest) longest = streak;
    } else {
      streak = 1;
    }
  }
  return { current, longest: Math.max(longest, current, sorted.length > 0 ? 1 : 0) };
}

export type MonthBestsResult = {
  longestRun: WorkoutListItem | null;
  fastestPace: WorkoutListItem | null;
};

/** 이달 최고 기록 — 최장 거리 + 최고 페이스 운동. */
export function monthBests(items: WorkoutListItem[]): MonthBestsResult {
  if (items.length === 0) return { longestRun: null, fastestPace: null };
  let longestRun = items[0];
  let fastestPace: WorkoutListItem | null = null;
  for (const w of items) {
    if (w.distanceM > longestRun.distanceM) longestRun = w;
    if (w.avgPaceSecPerKm != null) {
      if (fastestPace == null || w.avgPaceSecPerKm < fastestPace.avgPaceSecPerKm!) {
        fastestPace = w;
      }
    }
  }
  return { longestRun, fastestPace };
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
