import { describe, expect, it } from "vitest";
import type {
  ChallengeDetail,
  ChallengeMember,
  WorkoutListItem,
} from "@/lib/api/types";
import {
  buildHomeRaceComparison,
  buildWeeklyActivity,
  weeklyChartBarPercent,
  weeklyChartMaxDistanceM,
  weekDateKeys,
} from "@/lib/homeDashboard";

function workout(
  id: number,
  startedAtLocal: string,
  distanceM: number,
  durationSec = 1800,
): WorkoutListItem {
  return {
    id,
    startedAt: `${startedAtLocal}Z`,
    startedAtLocal,
    endedAt: `${startedAtLocal}Z`,
    distanceM,
    durationSec,
    calories: 200,
    avgPaceSecPerKm: distanceM > 0 ? durationSec / (distanceM / 1000) : null,
    workoutType: "GPS",
  };
}

function member(
  userId: string,
  totalKm: string,
  progressPercent: number | string,
  isRival = false,
): ChallengeMember {
  return {
    userId,
    nickname: userId,
    totalKm,
    remainingKm: "0",
    progressPercent,
    finished: false,
    finishedAt: null,
    finalRank: null,
    isRival,
  };
}

function detail(members: ChallengeMember[]): ChallengeDetail {
  return {
    id: 7,
    title: "30 km",
    goalKm: 30,
    maxMembers: 10,
    startAt: "2026-08-10T00:00:00",
    endAt: "2026-08-16T23:59:00",
    stake: null,
    crewName: null,
    creatorUserId: "me",
    currentUserId: "me",
    isMember: true,
    isOwner: true,
    hasStarted: true,
    hasEnded: false,
    showManage: true,
    canJoin: false,
    canLeave: true,
    memberCount: members.length,
    winner: null,
    members,
  };
}

describe("home weekly activity", () => {
  it("uses a Monday-to-Sunday window across a year boundary", () => {
    expect(weekDateKeys(new Date(2026, 0, 1))).toEqual([
      "2025-12-29",
      "2025-12-30",
      "2025-12-31",
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
      "2026-01-04",
    ]);
  });

  it("honors startedAtLocal, excludes week boundaries, and keeps weighted pace", () => {
    const result = buildWeeklyActivity(
      [
        workout(1, "2026-08-09T23:59:00", 9000),
        workout(2, "2026-08-10T06:00:00", 5000, 1500),
        workout(3, "2026-08-12T06:00:00", 10000, 3600),
        workout(4, "2026-08-17T00:00:00", 9000),
      ],
      new Date(2026, 7, 14),
    );

    expect(result.totalDistanceM).toBe(15000);
    expect(result.workoutCount).toBe(2);
    expect(result.dailyDistanceM).toEqual([5000, 0, 10000, 0, 0, 0, 0]);
    expect(result.avgPaceSecPerKm).toBe(340);
  });

  it("uses 500 m chart steps with headroom so 4 km and 5 km stay distinct", () => {
    const chartMaxDistanceM = weeklyChartMaxDistanceM([4000, 5000, 0, 0, 0, 0, 0]);

    expect(chartMaxDistanceM).toBe(5500);
    expect(weeklyChartBarPercent(4000, chartMaxDistanceM)).toBeCloseTo(72.73, 1);
    expect(weeklyChartBarPercent(5000, chartMaxDistanceM)).toBeCloseTo(90.91, 1);
  });

  it("caps the daily chart scale at 50 km", () => {
    expect(weeklyChartMaxDistanceM([49_800])).toBe(50_000);
    expect(weeklyChartMaxDistanceM([70_000])).toBe(50_000);
    expect(weeklyChartBarPercent(70_000, 50_000)).toBe(100);
  });
});

describe("home race comparison", () => {
  it("uses the app user id and prioritizes a marked rival", () => {
    const result = buildHomeRaceComparison(
      detail([
        member("leader", "22", 73),
        member("me", "18.4", 61.3),
        member("friend", "16.8", 56, true),
      ]),
    );

    expect(result?.me.member.userId).toBe("me");
    expect(result?.opponent?.member.userId).toBe("friend");
    expect(result?.me.totalKm).toBe(18.4);
  });

  it("falls back to the adjacent ranked runner and clamps progress", () => {
    const result = buildHomeRaceComparison(
      detail([
        member("leader", "35", 116.7),
        member("me", "18", -2),
      ]),
    );

    expect(result?.opponent?.member.userId).toBe("leader");
    expect(result?.opponent?.progressPercent).toBe(100);
    expect(result?.me.progressPercent).toBe(0);
  });

  it("computes progress from distance when the API percentage is invalid", () => {
    const result = buildHomeRaceComparison(
      detail([
        member("me", "18", "invalid"),
        member("other", "3", 10),
      ]),
    );

    expect(result?.me.progressPercent).toBe(60);
  });

  it("returns null when the current app user is not in the leaderboard", () => {
    expect(buildHomeRaceComparison(detail([member("other", "2", 5)]))).toBeNull();
  });
});
