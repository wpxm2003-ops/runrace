import { describe, expect, it } from "vitest";
import type { ChallengeListItem, ChallengeListPage } from "@/lib/api/types";
import {
  isChallengeListCacheKey,
  removeChallengeFromListCache,
} from "@/lib/challengeListCache";

const item = (id: number): ChallengeListItem => ({
  id,
  title: `race-${id}`,
  goalKm: 5,
  phase: "ACTIVE",
  startAt: "2026-08-10T00:00:00Z",
  endAt: null,
  memberCount: 1,
  createdAt: "2026-08-09T00:00:00Z",
  isOwner: false,
  isMember: false,
  hasPrize: false,
  hasStake: false,
  crewOnly: false,
});

describe("challengeListCache", () => {
  it("targets every race-list cache", () => {
    expect(isChallengeListCacheKey(["challenges-page", null, "ko", "active", 0])).toBe(true);
    expect(isChallengeListCacheKey(["challenges-mine-page", "uid", "active", 0])).toBe(true);
    expect(isChallengeListCacheKey(["crew-races", "uid", "active", 0])).toBe(true);
    expect(isChallengeListCacheKey(["challenge", 7, "uid"])).toBe(false);
  });

  it("removes only the missing race", () => {
    const page: ChallengeListPage = { items: [item(7), item(8)], hasNext: true };
    expect(removeChallengeFromListCache(page, 7)).toEqual({ items: [item(8)], hasNext: true });
    expect(removeChallengeFromListCache([item(7), item(8)], 7)).toEqual([item(8)]);
  });
});
