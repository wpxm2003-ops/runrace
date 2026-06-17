import { describe, expect, it } from "vitest";
import {
  formatDateRange,
  formatDateTimeMinute,
  isSameLocalDay,
  toDateTimeInputValue,
} from "@/lib/format";

// 로컬 타임존 의존을 피하려고 'Z' 없는 로컬 ISO 문자열을 사용한다.
describe("toDateTimeInputValue", () => {
  it("ISO를 datetime-local 값으로(초 절삭)", () => {
    expect(toDateTimeInputValue("2026-06-04T09:30:00")).toBe("2026-06-04T09:30");
    expect(toDateTimeInputValue("2026-12-09T00:05:59")).toBe("2026-12-09T00:05");
  });
});

describe("formatDateTimeMinute", () => {
  it("24시간 HH:mm을 포함한다", () => {
    expect(formatDateTimeMinute("2026-06-04T09:30:00", "en-US")).toContain("09:30");
  });
});

describe("formatDateRange", () => {
  it("종료가 없으면 '-'로 끝난다", () => {
    expect(formatDateRange("2026-06-04T09:30:00", null, "en-US")).toMatch(/~ -$/);
  });
  it("종료가 있으면 양쪽 시각을 포함", () => {
    const out = formatDateRange("2026-06-04T09:30:00", "2026-06-04T11:45:00", "en-US");
    expect(out).toContain("09:30");
    expect(out).toContain("11:45");
  });
});

describe("isSameLocalDay", () => {
  it("같은 날이면 true", () => {
    expect(isSameLocalDay("2026-06-04T01:00:00", "2026-06-04T23:00:00")).toBe(true);
  });
  it("다른 날이면 false", () => {
    expect(isSameLocalDay("2026-06-04T23:00:00", "2026-06-05T01:00:00")).toBe(false);
  });
});
