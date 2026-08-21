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

  // 23:59에는 startAt과 endAt이 같아져 endAfterStart로 생성 자체가 막혔다.
  it("rolls today's sprint to the next midnight when almost none of the day is left", () => {
    expect(raceTemplateWindow("today5", "2026-08-15T23:59")).toEqual({
      startAt: "2026-08-15T23:59",
      endAt: "2026-08-16T23:59",
    });
    expect(raceTemplateWindow("today5", "2026-08-15T23:30")).toEqual({
      startAt: "2026-08-15T23:30",
      endAt: "2026-08-16T23:59",
    });
  });

  it("keeps today's sprint on the same day when an hour or more is left", () => {
    expect(raceTemplateWindow("today5", "2026-08-15T22:59")).toEqual({
      startAt: "2026-08-15T22:59",
      endAt: "2026-08-15T23:59",
    });
  });

  // 2026-08-16은 일요일 — 그날 늦은 밤이면 이번 주말이 사실상 끝났다.
  it("rolls a weekend race to the next Sunday when the weekend is nearly over", () => {
    expect(raceTemplateWindow("weekend10", "2026-08-16T23:59")).toEqual({
      startAt: "2026-08-16T23:59",
      endAt: "2026-08-23T23:59",
    });
  });
});
