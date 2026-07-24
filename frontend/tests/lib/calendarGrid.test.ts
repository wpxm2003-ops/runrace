import { describe, expect, it } from "vitest";
import { monthCalendarCells } from "@/lib/calendarGrid";

describe("monthCalendarCells", () => {
  it("2026-07: 수요일 시작 31일 → 5주(35칸), 선행 빈 칸 3개", () => {
    const cells = monthCalendarCells("2026-07-01", "2026-07-21");
    expect(cells).toHaveLength(35);
    expect(cells.slice(0, 3)).toEqual([null, null, null]);
    expect(cells[3]).toMatchObject({ date: "2026-07-01" });
    expect(cells[33]).toMatchObject({ date: "2026-07-31" });
    expect(cells[34]).toBeNull();
  });

  it("2026-02: 일요일 시작 28일 → 정확히 4주(28칸), 빈 칸 없음", () => {
    const cells = monthCalendarCells("2026-02-01", "2026-02-15");
    expect(cells).toHaveLength(28);
    expect(cells.every((c) => c !== null)).toBe(true);
    expect(cells[0]).toMatchObject({ date: "2026-02-01" });
    expect(cells[27]).toMatchObject({ date: "2026-02-28" });
  });

  it("2026-08: 토요일 시작 31일 → 6주(42칸)", () => {
    const cells = monthCalendarCells("2026-08-01", "2026-08-01");
    expect(cells).toHaveLength(42);
    expect(cells.slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(cells[6]).toMatchObject({ date: "2026-08-01" });
    expect(cells[36]).toMatchObject({ date: "2026-08-31" });
    expect(cells.slice(37)).toEqual([null, null, null, null, null]);
  });

  it("2028-02: 윤년 29일(화요일 시작) → 35칸", () => {
    const cells = monthCalendarCells("2028-02-01", "2028-02-01");
    expect(cells).toHaveLength(35);
    expect(cells[2]).toMatchObject({ date: "2028-02-01" });
    expect(cells[30]).toMatchObject({ date: "2028-02-29" });
  });

  it("future: today 이후만 true, today 자신과 과거는 false", () => {
    const cells = monthCalendarCells("2026-07-01", "2026-07-21");
    const byDate = new Map(cells.filter((c) => c !== null).map((c) => [c.date, c]));
    expect(byDate.get("2026-07-20")?.future).toBe(false);
    expect(byDate.get("2026-07-21")?.future).toBe(false);
    expect(byDate.get("2026-07-22")?.future).toBe(true);
    expect(byDate.get("2026-07-31")?.future).toBe(true);
  });

  it("월 전체가 미래면(다음 달 1일 이전이 today) 모든 날짜가 future", () => {
    const cells = monthCalendarCells("2026-08-01", "2026-07-21");
    expect(cells.filter((c) => c !== null).every((c) => c.future)).toBe(true);
  });

  it("heatmapFrom이 1일이 아니어도 월 단위로 동작(YYYY-MM만 사용)", () => {
    expect(monthCalendarCells("2026-07-15", "2026-07-21")).toEqual(
      monthCalendarCells("2026-07-01", "2026-07-21"),
    );
  });
});
