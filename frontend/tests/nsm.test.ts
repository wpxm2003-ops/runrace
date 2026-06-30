import { describe, it, expect } from "vitest";
import {
  vdotFromRace,
  thresholdFromRace,
  thresholdPaceSecPerKm,
  weeklyPlan,
} from "@/lib/nsm";

describe("NSM VDOT 계산", () => {
  it("5K 20:00 → VDOT ≈ 49~50 (Daniels 표 기준)", () => {
    const vdot = vdotFromRace(5000, 20 * 60);
    expect(vdot).toBeGreaterThan(48);
    expect(vdot).toBeLessThan(51);
  });

  it("5K 22:00 → VDOT ≈ 44~45", () => {
    const vdot = vdotFromRace(5000, 22 * 60);
    expect(vdot).toBeGreaterThan(43);
    expect(vdot).toBeLessThan(46);
  });

  it("10K 45:00 → VDOT ≈ 45 (Daniels: 10K 45:16 = VDOT 45)", () => {
    const vdot = vdotFromRace(10000, 45 * 60);
    expect(vdot).toBeGreaterThan(44);
    expect(vdot).toBeLessThan(46);
  });
});

describe("NSM 역치 페이스", () => {
  it("5K 22:00 → 역치 페이스 4'30\"~4'50\"/km 범위", () => {
    const t = thresholdFromRace(5000, 22 * 60);
    expect(t).toBeGreaterThan(270); // 4'30"
    expect(t).toBeLessThan(290); // 4'50"
  });

  it("VDOT가 높을수록 역치 페이스가 빨라진다(초/km 감소)", () => {
    expect(thresholdPaceSecPerKm(50)).toBeLessThan(thresholdPaceSecPerKm(44));
  });
});

describe("NSM 주간 플랜", () => {
  const t = thresholdFromRace(5000, 22 * 60);

  it("7일(월~일) 전부 포함", () => {
    expect(weeklyPlan(t, [1, 3, 5])).toHaveLength(7);
  });

  it("sub-T 횟수가 고른 요일 수와 일치", () => {
    expect(weeklyPlan(t, [1, 3, 5]).filter((s) => s.isSubT)).toHaveLength(3);
    expect(weeklyPlan(t, [1, 4]).filter((s) => s.isSubT)).toHaveLength(2);
  });

  it("고른 요일에 sub-T가 배치된다", () => {
    const plan = weeklyPlan(t, [1, 3, 5]);
    expect(plan[1].isSubT).toBe(true); // 화
    expect(plan[3].isSubT).toBe(true); // 목
    expect(plan[5].isSubT).toBe(true); // 토
    expect(plan[0].isSubT).toBe(false); // 월
  });

  it("이른 요일부터 SHORT→MEDIUM→LONG 순으로 배정", () => {
    const plan = weeklyPlan(t, [1, 3, 5]);
    expect(plan[1].kind).toBe("SHORT");
    expect(plan[3].kind).toBe("MEDIUM");
    expect(plan[5].kind).toBe("LONG");
  });

  it("짧은 렙 < 중간 렙 < 긴 렙 (페이스 초/km)", () => {
    const plan = weeklyPlan(t, [1, 3, 5]);
    const short = plan.find((s) => s.kind === "SHORT")!.targetPaceSec!;
    const medium = plan.find((s) => s.kind === "MEDIUM")!.targetPaceSec!;
    const long = plan.find((s) => s.kind === "LONG")!.targetPaceSec!;
    expect(short).toBeLessThan(medium);
    expect(medium).toBeLessThan(long);
  });

  it("롱런이 정확히 1개 배치된다", () => {
    expect(weeklyPlan(t, [1, 3, 5]).filter((s) => s.kind === "LONGRUN")).toHaveLength(1);
    expect(weeklyPlan(t, [1, 4]).filter((s) => s.kind === "LONGRUN")).toHaveLength(1);
  });

  it("이지런 날이 sub-T보다 많다(자주 뛰되 대부분 이지)", () => {
    const plan = weeklyPlan(t, [1, 3, 5]);
    const easyish = plan.filter((s) => !s.isSubT).length;
    const subT = plan.filter((s) => s.isSubT).length;
    expect(easyish).toBeGreaterThan(subT);
  });

  it("계약 위반(4개+/중복/비정렬) 입력도 방어 — 최대 3 sub-T + 롱런 1개", () => {
    const plan = weeklyPlan(t, [6, 0, 1, 2, 3, 4, 5]); // 7개 전부
    expect(plan.filter((s) => s.isSubT).length).toBe(3);
    expect(plan.filter((s) => s.kind === "LONGRUN").length).toBe(1);
    expect(plan).toHaveLength(7);
  });
});
