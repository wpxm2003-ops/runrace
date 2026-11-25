import { describe, expect, it } from "vitest";
import {
  averageLabel,
  cohortWeekLabel,
  isWindowPartial,
  retentionRateLabel,
  visitCollectionDay,
} from "@/lib/adminRetention";

describe("재방문율 칸 표시", () => {
  it("비율과 (활동/판정 가능)을 함께 보여 준다", () => {
    expect(retentionRateLabel({ eligible: 12, retained: 5 })).toBe("42% (5/12)");
    expect(retentionRateLabel({ eligible: 3, retained: 3 })).toBe("100% (3/3)");
    expect(retentionRateLabel({ eligible: 4, retained: 0 })).toBe("0% (0/4)");
  });

  it("판정할 사람이 없으면 0%가 아니라 비워 둔다", () => {
    expect(retentionRateLabel({ eligible: 0, retained: 0 })).toBeNull();
  });
});

describe("일평균 DAU 표시", () => {
  it("소수 첫째 자리까지", () => {
    expect(averageLabel(1.75)).toBe("1.8");
    expect(averageLabel(2 / 7)).toBe("0.3");
    expect(averageLabel(0)).toBe("0.0");
  });

  it("집계할 날이 없으면 null", () => {
    expect(averageLabel(null)).toBeNull();
  });
});

describe("방문 수집 일차", () => {
  it("수집 시작일이 1일째", () => {
    expect(visitCollectionDay("2026-11-25", "2026-11-25")).toBe(1);
    expect(visitCollectionDay("2026-11-20", "2026-11-25")).toBe(6);
    // 월·연 경계
    expect(visitCollectionDay("2026-12-31", "2027-01-06")).toBe(7);
  });

  it("수집 전이면 0", () => {
    expect(visitCollectionDay(null, "2026-11-25")).toBe(0);
  });
});

describe("WAU·MAU 부분값 판정", () => {
  it("창 첫날이 판정 첫 날보다 이르면 부분값", () => {
    // WAU 창 11-19~11-25
    expect(isWindowPartial("2026-11-20", "2026-11-25", 7)).toBe(true);
    expect(isWindowPartial("2026-11-19", "2026-11-25", 7)).toBe(false);
    expect(isWindowPartial("2026-10-01", "2026-11-25", 7)).toBe(false);
    // MAU 창 10-27~11-25
    expect(isWindowPartial("2026-10-28", "2026-11-25", 30)).toBe(true);
    expect(isWindowPartial("2026-10-27", "2026-11-25", 30)).toBe(false);
  });

  it("수집 시작일이 창 첫날이어도(그 날은 부분 수집) 판정 첫 날 기준이라 부분값으로 본다", () => {
    // 11-19 정오 첫 핑 → 판정 첫 날 11-20. 수집 7일째지만 WAU 창 첫날 11-19는 오전이 빠졌다.
    expect(isWindowPartial("2026-11-20", "2026-11-25", 7)).toBe(true);
  });

  it("수집 전이면 부분값", () => {
    expect(isWindowPartial(null, "2026-11-25", 7)).toBe(true);
  });
});

describe("가입 주 라벨", () => {
  it("월~일을 M/D~M/D로", () => {
    expect(cohortWeekLabel("2026-11-16", "2026-11-22")).toBe("11/16~11/22");
    expect(cohortWeekLabel("2026-12-28", "2027-01-03")).toBe("12/28~1/3");
  });
});
