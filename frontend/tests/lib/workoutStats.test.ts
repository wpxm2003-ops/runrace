import { describe, expect, it } from "vitest";
import { workoutDayKey, workoutsOnDate, dayOfWeekDistribution } from "@/lib/workoutStats";
import type { WorkoutListItem } from "@/lib/api/types";

function item(startedAt: string, startedAtLocal?: string): WorkoutListItem {
  return {
    id: 1,
    startedAt,
    ...(startedAtLocal ? { startedAtLocal } : {}),
    endedAt: startedAt,
    durationSec: 1800,
    distanceM: 5000,
    calories: 300,
    avgPaceSecPerKm: 360,
    workoutType: "GPS",
  };
}

describe("workoutDayKey — 패턴 A 날짜 박제", () => {
  it("서버가 박제한 벽시계 날짜를 그대로 쓴다 — 뷰어 타임존과 무관", () => {
    // 마닐라(UTC+8) 8/11 저녁 8시 런. UTC로는 8/11 12:00.
    // 뷰어가 어디에 있든(KST면 localDateKey는 8/11 21시로 같은 날이지만, 뉴욕이면 8/11 08시)
    // 박제된 8/11이 나와야 한다.
    expect(workoutDayKey(item("2026-08-11T12:00:00Z", "2026-08-11T20:00:00"))).toBe("2026-08-11");
  });

  it("UTC 날짜와 현지 날짜가 다른 경우 — 현지가 이긴다", () => {
    // 뉴욕(UTC-4) 8/11 저녁 8시 런은 UTC로 8/12 자정. 기록은 8/11의 것이다.
    expect(workoutDayKey(item("2026-08-12T00:00:00Z", "2026-08-11T20:00:00"))).toBe("2026-08-11");
  });

  it("구응답(박제 없음)은 뷰어 로컬 변환으로 폴백한다", () => {
    const key = workoutDayKey(item("2026-08-11T12:00:00Z"));
    // 뷰어 타임존에 따라 달라지므로 형식만 고정 — 폴백 경로가 죽지 않는 것이 요점.
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("날짜별 조회·요일 분포도 박제된 날짜 기준", () => {
    const w = item("2026-08-12T00:00:00Z", "2026-08-11T20:00:00"); // 화요일(8/11)
    expect(workoutsOnDate([w], "2026-08-11")).toHaveLength(1);
    expect(workoutsOnDate([w], "2026-08-12")).toHaveLength(0);
    const dist = dayOfWeekDistribution([w]);
    expect(dist[1]).toBe(1); // Mon=0 이므로 화요일은 index 1
  });
});
