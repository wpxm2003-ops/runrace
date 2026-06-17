import { describe, expect, it } from "vitest";
import {
  formatDistance,
  formatDistanceAmount,
  formatGoalDistance,
  formatPace,
  goalInputFromKm,
  goalKmFromInput,
  goalMaxInUnit,
  kmFromInput,
  metersFromInput,
} from "@/lib/units";

describe("formatDistance", () => {
  it("미터를 km 문자열로(소수 2자리)", () => {
    expect(formatDistance(1234, "km")).toBe("1.23 km");
    expect(formatDistance(0, "km")).toBe("0.00 km");
  });
  it("미터를 mi 문자열로", () => {
    expect(formatDistance(1609.344, "mi")).toBe("1.00 mi");
  });
});

describe("formatDistanceAmount", () => {
  it("km 값을 단위 변환(라벨 없음)", () => {
    expect(formatDistanceAmount(5, "km")).toBe("5.00");
    expect(formatDistanceAmount(5, "mi")).toBe("3.11");
  });
  it("숫자가 아니면 원본 문자열 반환", () => {
    expect(formatDistanceAmount("abc", "km")).toBe("abc");
  });
});

describe("formatGoalDistance", () => {
  it("끝자리 0을 제거하고 단위 라벨을 붙인다", () => {
    expect(formatGoalDistance(5, "km")).toBe("5 km");
    expect(formatGoalDistance(10, "km")).toBe("10 km");
    expect(formatGoalDistance(8.04672, "mi")).toBe("5 mi");
  });
});

describe("goalKmFromInput / goalInputFromKm 왕복", () => {
  it("km은 그대로, mi는 환산", () => {
    expect(goalKmFromInput("5", "km")).toBe(5);
    expect(goalKmFromInput("5", "mi")).toBeCloseTo(8.04672, 5);
  });
  it("유효하지 않으면 NaN", () => {
    expect(goalKmFromInput("", "km")).toBeNaN();
    expect(goalKmFromInput("abc", "km")).toBeNaN();
  });
  it("km→입력값 환산(끝자리 0 제거)", () => {
    expect(goalInputFromKm(5, "km")).toBe("5");
    expect(goalInputFromKm(8.04672, "mi")).toBe("5");
  });
});

describe("goalMaxInUnit", () => {
  it("km은 1000, mi는 내림 환산", () => {
    expect(goalMaxInUnit("km")).toBe(1000);
    expect(goalMaxInUnit("mi")).toBe(621.3);
  });
});

describe("metersFromInput / kmFromInput", () => {
  it("입력 거리를 미터로(반올림)", () => {
    expect(metersFromInput("1", "km")).toBe(1000);
    expect(metersFromInput("1", "mi")).toBe(1609);
    expect(metersFromInput("abc", "km")).toBeNaN();
  });
  it("입력 거리를 km로", () => {
    expect(kmFromInput("5", "km")).toBe(5);
    expect(kmFromInput("5", "mi")).toBeCloseTo(8.04672, 5);
  });
});

describe("formatPace", () => {
  it("km/mi 페이스 계산", () => {
    expect(formatPace(1000, 300, "km")).toBe("5'00\"");
    expect(formatPace(1609.344, 300, "mi")).toBe("5'00\"");
  });
  it("거리가 너무 짧거나 시간이 0이면 '-'", () => {
    expect(formatPace(5, 300, "km")).toBe("-");
    expect(formatPace(1000, 0, "km")).toBe("-");
  });
});
