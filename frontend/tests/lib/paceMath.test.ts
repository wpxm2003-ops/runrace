import { describe, expect, it } from "vitest";
import {
  RACE_DISTANCES_KM,
  finishSecFromPace,
  formatHms,
  mphFromKmh,
  paceSecFromFinish,
  paceSecFromSpeedKmh,
  speedKmhFromPaceSec,
  splitPointsKm,
} from "@/lib/paceMath";

describe("paceSecFromSpeedKmh / speedKmhFromPaceSec", () => {
  it("12 km/h ↔ 300초/km(5'00\")", () => {
    expect(paceSecFromSpeedKmh(12)).toBe(300);
    expect(speedKmhFromPaceSec(300)).toBe(12);
  });
  it("0 이하·비유한 값은 NaN", () => {
    expect(paceSecFromSpeedKmh(0)).toBeNaN();
    expect(paceSecFromSpeedKmh(-3)).toBeNaN();
    expect(paceSecFromSpeedKmh(NaN)).toBeNaN();
    expect(speedKmhFromPaceSec(0)).toBeNaN();
  });
});

describe("mphFromKmh", () => {
  it("1마일 = 1.609344km", () => {
    expect(mphFromKmh(1.609344)).toBeCloseTo(1, 10);
    expect(mphFromKmh(16.09344)).toBeCloseTo(10, 10);
  });
});

describe("paceSecFromFinish / finishSecFromPace", () => {
  it("10km를 3000초에 → 300초/km, 역방향도 일치", () => {
    expect(paceSecFromFinish(10, 3000)).toBe(300);
    expect(finishSecFromPace(10, 300)).toBe(3000);
  });
  it("풀코스 6'00\" 페이스 → 4시간 13분대", () => {
    expect(finishSecFromPace(RACE_DISTANCES_KM.full, 360)).toBeCloseTo(15190.2, 5);
  });
  it("0·음수·NaN 입력은 NaN", () => {
    expect(paceSecFromFinish(0, 3000)).toBeNaN();
    expect(paceSecFromFinish(10, 0)).toBeNaN();
    expect(finishSecFromPace(NaN, 300)).toBeNaN();
  });
});

describe("formatHms", () => {
  it("1시간 미만은 M:SS", () => {
    expect(formatHms(299)).toBe("4:59");
    expect(formatHms(0)).toBe("0:00");
  });
  it("1시간 이상은 H:MM:SS", () => {
    expect(formatHms(3600)).toBe("1:00:00");
    expect(formatHms(15190.2)).toBe("4:13:10");
  });
  it("반올림으로 60초가 되면 자리올림", () => {
    expect(formatHms(59.7)).toBe("1:00");
    expect(formatHms(3599.6)).toBe("1:00:00");
  });
  it("비정상 값은 -", () => {
    expect(formatHms(NaN)).toBe("-");
    expect(formatHms(-1)).toBe("-");
  });
});

describe("splitPointsKm", () => {
  it("15km 이하는 1km 간격 + 최종 지점", () => {
    expect(splitPointsKm(10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(splitPointsKm(7.5)).toEqual([1, 2, 3, 4, 5, 6, 7, 7.5]);
  });
  it("15km 초과는 5km 간격 + 최종 지점", () => {
    expect(splitPointsKm(RACE_DISTANCES_KM.half)).toEqual([5, 10, 15, 20, RACE_DISTANCES_KM.half]);
    expect(splitPointsKm(RACE_DISTANCES_KM.full)).toEqual([5, 10, 15, 20, 25, 30, 35, 40, RACE_DISTANCES_KM.full]);
  });
  it("유효하지 않은 거리는 빈 배열", () => {
    expect(splitPointsKm(0)).toEqual([]);
    expect(splitPointsKm(NaN)).toEqual([]);
  });
});
