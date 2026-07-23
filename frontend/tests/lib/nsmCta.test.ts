import { describe, expect, it } from "vitest";
import type { GhostRaceResult } from "@/lib/ghostRace";
import { evaluateNsmCta, isCloseLoss, isGhostLoss, LOSS_STREAK_THRESHOLD } from "@/lib/nsmCta";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000; // 고정 시각 — 게이트는 now를 인자로 받는다

function result(deltaMs: number, ghostTimeMs = 1_800_000): GhostRaceResult {
  return {
    overlapDistanceM: 5000,
    ghostTimeMs,
    myTimeMs: ghostTimeMs + deltaMs,
    deltaMs,
  };
}

describe("isGhostLoss", () => {
  it("결과 카드와 같은 반올림 기준 — 반올림 0초는 무승부", () => {
    expect(isGhostLoss(result(400))).toBe(false); // 0.4초 → 0초 = 무승부
    expect(isGhostLoss(result(600))).toBe(true); // 0.6초 → 1초 패배
    expect(isGhostLoss(result(-5_000))).toBe(false); // 승리
  });
});

describe("isCloseLoss", () => {
  it("유령 시간의 5% 이내 패배만 접전", () => {
    // 30분 유령 → 5% = 90초
    expect(isCloseLoss(result(60_000, 1_800_000))).toBe(true);
    expect(isCloseLoss(result(90_000, 1_800_000))).toBe(true);
    expect(isCloseLoss(result(120_000, 1_800_000))).toBe(false);
  });

  it("짧은 런은 15초 바닥이 적용된다", () => {
    // 100초 유령 → 5% = 5초지만 바닥 15초까지 접전
    expect(isCloseLoss(result(10_000, 100_000))).toBe(true);
    expect(isCloseLoss(result(20_000, 100_000))).toBe(false);
  });

  it("승리·무승부는 접전이 아니다", () => {
    expect(isCloseLoss(result(-1_000))).toBe(false);
    expect(isCloseLoss(result(0))).toBe(false);
  });
});

describe("evaluateNsmCta", () => {
  const closeLoss = result(30_000); // 30분 유령에게 30초 차 접전 패배
  const blowout = result(300_000); // 5분 차 대패
  const base = { hasPlan: false, lossStreak: 1, lastShownAt: 0, now: NOW };

  it("접전 패배 + 플랜 없음 + 캡 여유 → 노출", () => {
    expect(evaluateNsmCta({ ...base, result: closeLoss })).toBe(true);
  });

  it("활성 플랜이 있으면 어떤 경우에도 노출하지 않는다", () => {
    expect(evaluateNsmCta({ ...base, result: closeLoss, hasPlan: true })).toBe(false);
  });

  it("승리·무승부에는 노출하지 않는다", () => {
    expect(evaluateNsmCta({ ...base, result: result(-30_000) })).toBe(false);
    expect(evaluateNsmCta({ ...base, result: result(0) })).toBe(false);
  });

  it("대패는 연패가 쌓였을 때만 노출한다", () => {
    expect(evaluateNsmCta({ ...base, result: blowout, lossStreak: 1 })).toBe(false);
    expect(
      evaluateNsmCta({ ...base, result: blowout, lossStreak: LOSS_STREAK_THRESHOLD }),
    ).toBe(true);
  });

  it("7일 캡 — 노출 후 7일이 지나야 다시 열린다", () => {
    expect(
      evaluateNsmCta({ ...base, result: closeLoss, lastShownAt: NOW - 3 * DAY_MS }),
    ).toBe(false);
    expect(
      evaluateNsmCta({ ...base, result: closeLoss, lastShownAt: NOW - 8 * DAY_MS }),
    ).toBe(true);
  });
});
