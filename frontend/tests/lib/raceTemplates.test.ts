import { describe, expect, it } from "vitest";
import { raceTemplateWindow } from "@/lib/raceTemplates";

describe("raceTemplateWindow", () => {
  it("ends today's sprint at 23:59", () => {
    expect(raceTemplateWindow("today5", "2026-08-15T08:40")).toEqual({
      startAt: "2026-08-15T08:40",
      endAt: "2026-08-15T23:59",
    });
  });

  it("ends a weekend race on Sunday at 23:59", () => {
    expect(raceTemplateWindow("weekend10", "2026-08-15T08:40")).toEqual({
      startAt: "2026-08-15T08:40",
      endAt: "2026-08-16T23:59",
    });
  });

  it("gives the popular race a seven-day window", () => {
    expect(raceTemplateWindow("week30", "2026-08-15T08:40")).toEqual({
      startAt: "2026-08-15T08:40",
      endAt: "2026-08-22T08:40",
    });
  });
});
