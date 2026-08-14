import type {
  ChallengeDetail,
  ChallengeMember,
  WorkoutListItem,
} from "@/lib/api/types";
import {
  aggregateWorkouts,
  workoutDayKey,
  type WorkoutAggregate,
} from "@/lib/workoutStats";
import { ymd } from "@/lib/format";

export type WeeklyActivity = WorkoutAggregate & {
  dayKeys: string[];
  dailyDistanceM: number[];
};

export const WEEKLY_CHART_STEP_M = 500;
export const WEEKLY_CHART_MAX_M = 50_000;

/**
 * Keeps short runs readable while allowing the chart to grow with the week.
 * The tallest bar gets one 500 m step of headroom, capped at 50 km per day.
 */
export function weeklyChartMaxDistanceM(dailyDistanceM: number[]): number {
  const longestDistanceM = Math.max(
    ...dailyDistanceM.map((distanceM) =>
      Number.isFinite(distanceM) ? Math.max(distanceM, 0) : 0,
    ),
    0,
  );
  const steppedDistanceM =
    Math.ceil(longestDistanceM / WEEKLY_CHART_STEP_M) * WEEKLY_CHART_STEP_M;

  return Math.min(
    WEEKLY_CHART_MAX_M,
    Math.max(5_000, steppedDistanceM + WEEKLY_CHART_STEP_M),
  );
}

export function weeklyChartBarPercent(
  distanceM: number,
  chartMaxDistanceM: number,
): number {
  if (!Number.isFinite(distanceM) || distanceM <= 0) return 5;
  const steppedDistanceM = Math.max(
    WEEKLY_CHART_STEP_M,
    Math.floor(distanceM / WEEKLY_CHART_STEP_M) * WEEKLY_CHART_STEP_M,
  );
  return Math.min(
    100,
    Math.max((steppedDistanceM / Math.max(chartMaxDistanceM, 1)) * 100, 10),
  );
}

/** Monday through Sunday in the viewer's local calendar. */
export function weekDateKeys(today: Date): string[] {
  const monday = new Date(today);
  monday.setHours(12, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));

  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + index);
    return ymd(day.getFullYear(), day.getMonth() + 1, day.getDate());
  });
}

/**
 * Builds the home dashboard's weekly totals using the same device wall-clock
 * date rule as Records. The aggregate pace stays distance-weighted.
 */
export function buildWeeklyActivity(
  items: WorkoutListItem[],
  today: Date,
): WeeklyActivity {
  const dayKeys = weekDateKeys(today);
  const dayIndex = new Map(dayKeys.map((key, index) => [key, index]));
  const dailyDistanceM = Array.from({ length: 7 }, () => 0);
  const weekItems: WorkoutListItem[] = [];

  for (const item of items) {
    const index = dayIndex.get(workoutDayKey(item));
    if (index == null) continue;
    weekItems.push(item);
    dailyDistanceM[index] += item.distanceM;
  }

  return {
    ...aggregateWorkouts(weekItems),
    dayKeys,
    dailyDistanceM,
  };
}

export type HomeRaceRunner = {
  member: ChallengeMember;
  totalKm: number;
  progressPercent: number;
};

export type HomeRaceComparison = {
  me: HomeRaceRunner;
  opponent: HomeRaceRunner | null;
  memberCount: number;
};

function finiteNumber(value: string | number | null | undefined): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function runner(member: ChallengeMember, goalKm: number): HomeRaceRunner {
  const totalKm = Math.max(finiteNumber(member.totalKm), 0);
  const apiProgress = Number(member.progressPercent);
  const computedProgress = goalKm > 0 ? (totalKm / goalKm) * 100 : 0;
  const progressPercent = Number.isFinite(apiProgress)
    ? Math.min(Math.max(apiProgress, 0), 100)
    : Math.min(Math.max(computedProgress, 0), 100);

  return { member, totalKm, progressPercent };
}

/**
 * Selects a truthful home-card comparison from the detail response. A marked
 * rival wins; otherwise the nearest ranked runner is shown without changing
 * the server-provided leaderboard order.
 */
export function buildHomeRaceComparison(
  detail: ChallengeDetail | null | undefined,
): HomeRaceComparison | null {
  if (!detail?.currentUserId) return null;
  const myIndex = detail.members.findIndex(
    (member) => member.userId === detail.currentUserId,
  );
  if (myIndex < 0) return null;

  const me = detail.members[myIndex];
  const rival = detail.members.find(
    (member) => member.userId !== detail.currentUserId && member.isRival,
  );
  const adjacent = myIndex > 0
    ? detail.members[myIndex - 1]
    : detail.members[myIndex + 1];
  const opponent = rival ?? adjacent ?? null;

  return {
    me: runner(me, detail.goalKm),
    opponent: opponent ? runner(opponent, detail.goalKm) : null,
    memberCount: detail.memberCount,
  };
}
