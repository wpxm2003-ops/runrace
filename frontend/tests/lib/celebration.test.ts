import { describe, expect, it } from "vitest";
import { celebrationTone } from "@/lib/celebration";
import type { PersonalBest } from "@/lib/api/types";
import type { GhostRaceResult } from "@/lib/ghostRace";

const pb: PersonalBest = {
  distanceKey: "5k",
  newPaceSec: 300,
  previousPaceSec: 310,
  daysSincePrevious: 12,
};

function ghost(deltaMs: number): GhostRaceResult {
  return { deltaMs, overlapDistanceM: 5000, myTimeMs: 1_500_000, ghostTimeMs: 1_500_000 + deltaMs };
}

const NOTHING = {
  achievementCount: 0,
  personalBest: null,
  ghostResult: null,
  ghostLabel: null,
};

describe("celebrationTone", () => {
  it("보여줄 카드가 하나도 없으면 모달을 띄우지 않는다", () => {
    expect(celebrationTone(NOTHING)).toEqual({ show: false, celebratory: false });
  });

  it("성과가 있으면 축하 연출과 함께 띄운다", () => {
    expect(celebrationTone({ ...NOTHING, achievementCount: 1 })).toEqual({
      show: true,
      celebratory: true,
    });
  });

  it("개인 최고 기록만 있어도 축하한다 — 성과 코드와 별개 경로다", () => {
    expect(celebrationTone({ ...NOTHING, personalBest: pb })).toEqual({
      show: true,
      celebratory: true,
    });
  });

  it("고스트 승리는 축하 대상이다", () => {
    const r = celebrationTone({ ...NOTHING, ghostResult: ghost(-3000), ghostLabel: "지난 5k" });
    expect(r).toEqual({ show: true, celebratory: true });
  });

  it("고스트 패배는 모달만 띄우고 축하 연출은 뺀다 — 훈련 제안 CTA가 그 카드 안에 있다", () => {
    const r = celebrationTone({ ...NOTHING, ghostResult: ghost(4000), ghostLabel: "지난 5k" });
    expect(r).toEqual({ show: true, celebratory: false });
  });

  it("고스트 무승부도 축하 연출은 없다", () => {
    const r = celebrationTone({ ...NOTHING, ghostResult: ghost(0), ghostLabel: "지난 5k" });
    expect(r).toEqual({ show: true, celebratory: false });
  });

  it("표시상 무승부(반올림 0초)인 근소한 앞섬은 축하하지 않는다 — 카드 문구와 연출을 일치시킨다", () => {
    const r = celebrationTone({ ...NOTHING, ghostResult: ghost(-400), ghostLabel: "지난 5k" });
    expect(r).toEqual({ show: true, celebratory: false });
  });

  it("라벨 없는 고스트 결과로는 모달을 열지 않는다 — 카드가 렌더되지 않아 빈 모달이 된다", () => {
    expect(celebrationTone({ ...NOTHING, ghostResult: ghost(-3000), ghostLabel: null })).toEqual({
      show: false,
      celebratory: false,
    });
  });

  it("빈 문자열 라벨도 카드가 렌더되지 않으므로 모달을 열지 않는다", () => {
    expect(celebrationTone({ ...NOTHING, ghostResult: ghost(-3000), ghostLabel: "" })).toEqual({
      show: false,
      celebratory: false,
    });
  });

  it("고스트 패배라도 성과가 함께 있으면 축하한다", () => {
    const r = celebrationTone({
      ...NOTHING,
      achievementCount: 2,
      ghostResult: ghost(9000),
      ghostLabel: "지난 5k",
    });
    expect(r).toEqual({ show: true, celebratory: true });
  });
});
