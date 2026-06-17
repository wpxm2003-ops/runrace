import { describe, expect, it } from "vitest";
import { estimateCalories, formatDuration } from "@/lib/workoutTrack";

describe("formatDuration", () => {
  it("1시간 미만은 mm:ss", () => {
    expect(formatDuration(0)).toBe("00:00");
    expect(formatDuration(5)).toBe("00:05");
    expect(formatDuration(65)).toBe("01:05");
    expect(formatDuration(3599)).toBe("59:59");
  });
  it("1시간 이상은 h:mm:ss", () => {
    expect(formatDuration(3600)).toBe("1:00:00");
    expect(formatDuration(3661)).toBe("1:01:01");
  });
  it("음수는 0으로 클램프", () => {
    expect(formatDuration(-5)).toBe("00:00");
  });
});

describe("estimateCalories", () => {
  it("km당 약 65kcal(반올림)", () => {
    expect(estimateCalories(0)).toBe(0);
    expect(estimateCalories(1000)).toBe(65);
    expect(estimateCalories(5000)).toBe(325);
  });
});
