import { describe, expect, it } from "vitest";
import {
  buildWorkoutFinishSnapshot,
  isWorkoutSessionVisible,
  resolveWorkoutGeoError,
} from "@/lib/workoutSessionPresentation";

describe("workoutSessionPresentation", () => {
  it("현재 사용자 소유 세션만 노출한다", () => {
    expect(isWorkoutSessionVisible(false, "me", "running", "me")).toBe(true);
    expect(isWorkoutSessionVisible(false, "other", "running", "me")).toBe(false);
    expect(isWorkoutSessionVisible(true, "me", "running", "me")).toBe(false);
  });

  it("위치 오류 코드에 주입 문구를 우선 적용한다", () => {
    expect(resolveWorkoutGeoError({ code: "timeout" }, {
      unavailable: "unavailable",
      insecure: "insecure",
      permission: "permission",
      timeout: "시간 초과",
      unknown: "unknown",
    })).toBe("시간 초과");
    expect(resolveWorkoutGeoError({ text: "native error" })).toBe("native error");
  });

  it("종료 스냅샷을 반올림하고 빈 경로에는 현재 위치를 사용한다", () => {
    const snapshot = buildWorkoutFinishSnapshot({
      clientWorkoutId: "run-1",
      runStartedAt: 1_000,
      pausedAccumMs: 2_000,
      pauseStartedAt: null,
      endedAtMs: 13_000,
      distanceM: 1_234.6,
      path: [],
      position: { lat: 37.5, lng: 127 },
    });

    expect(snapshot.clientWorkoutId).toBe("run-1");
    expect(snapshot.durationSec).toBe(10);
    expect(snapshot.distanceM).toBe(1_235);
    expect(snapshot.path).toEqual([{ lat: 37.5, lng: 127 }]);
  });
});
