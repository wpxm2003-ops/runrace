import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Achievement, WeeklyGoalStatus } from "@/lib/api/types";
import { achievementView, achievementViews } from "@/lib/achievements";
import { track } from "@/lib/analytics";
import { en } from "@/lib/i18n/locales/en";
import { ko } from "@/lib/i18n/locales/ko";
import {
  clampGoalInput,
  formatGoalDistanceAmount,
  formatProgressDistance,
  formatRemainingDistance,
  formatWeeklyGoal,
  formatWeeklyGoalProgress,
  formatWeeklyGoalRemaining,
  goalInputBounds,
  goalInputFromTarget,
  goalTargetFromInput,
  trackWeeklyGoalAchieved,
  weeklyGoalProgress,
} from "@/lib/weeklyGoal";

vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));

function status(overrides: Partial<WeeklyGoalStatus> = {}): WeeklyGoalStatus {
  return {
    goal: null,
    weekStart: "2026-11-23",
    distanceM: 0,
    runs: 0,
    currentStreakDays: 0,
    suggestion: { distanceM: 12_000, runs: 3, fromHistory: true },
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("weekly goal progress state", () => {
  it("is 'none' without a goal and suggests distance when there is history", () => {
    const state = weeklyGoalProgress(status({ currentStreakDays: 4 }));
    expect(state).toEqual({
      kind: "none",
      suggestion: { type: "DISTANCE", target: 12_000 },
      fromHistory: true,
      streakDays: 4,
    });
  });

  it("suggests the beginner run-count goal when there is no history", () => {
    const state = weeklyGoalProgress(
      status({ suggestion: { distanceM: 5_000, runs: 2, fromHistory: false } }),
    );
    expect(state.kind).toBe("none");
    if (state.kind !== "none") return;
    expect(state.suggestion).toEqual({ type: "RUNS", target: 2 });
    expect(state.fromHistory).toBe(false);
  });

  it("tracks distance progress, remaining meters and percent", () => {
    const state = weeklyGoalProgress(
      status({ goal: { type: "DISTANCE", target: 15_000 }, distanceM: 8_200, runs: 2, currentStreakDays: 2 }),
    );
    expect(state.kind).toBe("in_progress");
    if (state.kind === "none") return;
    expect(state.current).toBe(8_200);
    expect(state.remaining).toBe(6_800);
    expect(state.percent).toBeCloseTo(54.67, 1);
    expect(state.streakDays).toBe(2);
  });

  it("uses the run count for RUNS goals", () => {
    const state = weeklyGoalProgress(
      status({ goal: { type: "RUNS", target: 3 }, distanceM: 30_000, runs: 2 }),
    );
    expect(state.kind).toBe("in_progress");
    if (state.kind === "none") return;
    expect(state.current).toBe(2);
    expect(state.remaining).toBe(1);
  });

  it("is 'achieved' at exactly the target and caps percent at 100 above it", () => {
    const exact = weeklyGoalProgress(status({ goal: { type: "RUNS", target: 3 }, runs: 3 }));
    expect(exact.kind).toBe("achieved");
    const over = weeklyGoalProgress(
      status({ goal: { type: "DISTANCE", target: 15_000 }, distanceM: 21_500 }),
    );
    expect(over.kind).toBe("achieved");
    if (over.kind === "none") return;
    expect(over.percent).toBe(100);
    expect(over.remaining).toBe(0);
  });

  it("treats broken numbers as zero instead of showing NaN", () => {
    const state = weeklyGoalProgress(
      status({ goal: { type: "DISTANCE", target: 15_000 }, distanceM: Number.NaN, currentStreakDays: -3 }),
    );
    expect(state.kind).toBe("in_progress");
    if (state.kind === "none") return;
    expect(state.current).toBe(0);
    expect(state.percent).toBe(0);
    expect(state.streakDays).toBe(0);
  });

  it("falls back to 'none' for an invalid stored target", () => {
    expect(weeklyGoalProgress(status({ goal: { type: "RUNS", target: 0 } })).kind).toBe("none");
  });
});

describe("weekly goal units", () => {
  it("keeps sheet bounds inside the server range in km, mi and runs", () => {
    expect(goalInputBounds("DISTANCE", "km")).toEqual({ min: 1, max: 300 });
    expect(goalInputBounds("DISTANCE", "mi")).toEqual({ min: 1, max: 186 });
    expect(goalInputBounds("RUNS", "km")).toEqual({ min: 1, max: 14 });
    expect(goalTargetFromInput("DISTANCE", 186, "mi")).toBeLessThanOrEqual(300_000);
    expect(goalTargetFromInput("DISTANCE", 1, "mi")).toBeGreaterThanOrEqual(1_000);
  });

  it("round-trips a saved mile goal without drifting up", () => {
    const meters = goalTargetFromInput("DISTANCE", 15, "mi");
    expect(meters).toBe(24_140);
    expect(goalInputFromTarget("DISTANCE", meters, "mi")).toBe(15);
  });

  it("rounds suggestions up to a whole unit and clamps inputs", () => {
    expect(goalInputFromTarget("DISTANCE", 6_000, "mi")).toBe(4);
    expect(goalInputFromTarget("DISTANCE", 12_000, "km")).toBe(12);
    expect(clampGoalInput("RUNS", 20, "km")).toBe(14);
    expect(clampGoalInput("RUNS", 0, "km")).toBe(1);
    expect(clampGoalInput("DISTANCE", Number.NaN, "km")).toBe(1);
    expect(goalTargetFromInput("RUNS", 3, "km")).toBe(3);
  });

  it("never shows progress above the goal before it is reached", () => {
    expect(formatProgressDistance(14_990, "km")).toBe("14.9");
    expect(formatProgressDistance(8_200, "km")).toBe("8.2");
    expect(formatProgressDistance(0, "km")).toBe("0.0");
  });

  it("rounds the remaining distance up so it is enough to finish", () => {
    expect(formatRemainingDistance(6_750, "km")).toBe("6.8");
    expect(formatRemainingDistance(7_000, "km")).toBe("7");
    expect(formatRemainingDistance(1, "km")).toBe("0.1");
    expect(formatGoalDistanceAmount(15_000, "km")).toBe("15");
    expect(formatGoalDistanceAmount(24_140, "mi")).toBe("15");
  });

  it("formats goal, progress and remaining text per locale", () => {
    const distance = { type: "DISTANCE" as const, target: 15_000 };
    const runs = { type: "RUNS" as const, target: 3 };
    expect(formatWeeklyGoal(distance, "km", ko)).toBe("15 km");
    expect(formatWeeklyGoal(runs, "km", ko)).toBe("3회");
    expect(formatWeeklyGoal(runs, "km", en)).toBe("3 runs");
    expect(formatWeeklyGoalProgress(distance, 8_200, "km", ko)).toEqual({ current: "8.2", target: "15 km" });
    expect(formatWeeklyGoalProgress(runs, 2, "km", ko)).toEqual({ current: "2", target: "3회" });
    expect(formatWeeklyGoalRemaining("DISTANCE", 6_800, "km", ko)).toBe("6.8 km");
    expect(formatWeeklyGoalRemaining("RUNS", 1, "km", en)).toBe("1 run");
  });
});

describe("weekly goal achievement", () => {
  const distanceReached: Achievement = { code: "WEEKLY_GOAL_REACHED", value: 15_000, value2: 0 };
  const runsReached: Achievement = { code: "WEEKLY_GOAL_REACHED", value: 3, value2: 1 };

  it("renders the celebration card text for distance and run goals", () => {
    expect(achievementView(distanceReached, ko, "km")).toEqual({
      icon: "🏅",
      text: "이번 주 목표 15 km 달성",
      tone: "gold",
    });
    expect(achievementView(runsReached, ko, "km")?.text).toBe("이번 주 목표 3회 달성");
    expect(achievementView(runsReached, en, "km")?.text).toBe("Weekly goal reached: 3 runs");
    // 축하 모달 게이트(achievementViews 길이)에 들어가야 모달이 뜬다.
    expect(achievementViews([distanceReached], ko, "km")).toHaveLength(1);
  });

  it("tracks weekly_goal_achieved only when the save response has it", () => {
    trackWeeklyGoalAchieved([{ code: "STREAK", value: 7, value2: null }], "gps");
    trackWeeklyGoalAchieved(undefined, "gps");
    expect(track).not.toHaveBeenCalled();

    trackWeeklyGoalAchieved([{ code: "STREAK", value: 7, value2: null }, runsReached], "indoor");
    expect(track).toHaveBeenCalledWith("weekly_goal_achieved", {
      goal_type: "RUNS",
      target: 3,
      source: "indoor",
    });
  });
});
