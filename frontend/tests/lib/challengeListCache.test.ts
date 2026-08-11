import { describe, expect, it } from "vitest";
import { unstable_serialize } from "swr/infinite";
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

  it("useSWRInfinite 집계 키($inf$ 문자열)도 잡는다", () => {
    // 실측 회귀: 배열 페이지 키만 매칭해 집계 캐시가 남았고, 앱을 켜둔 화면에서
    // 삭제된 레이스가 계속 보였다. 집계 키는 배열 키를 직렬화한 "$inf$…" 문자열이다.
    // 실제 SWR 직렬화기로 키를 만들어 검증한다 — 포맷을 추정으로 박으면 SWR 업그레이드 때
    // 조용히 깨진다.
    expect(
      isChallengeListCacheKey(
        unstable_serialize((i) => ["challenges-page", null, "ko", "active", i]),
      ),
    ).toBe(true);
    expect(
      isChallengeListCacheKey(
        unstable_serialize((i) => ["challenges-mine-page", "uid", "active", i]),
      ),
    ).toBe(true);
    expect(
      isChallengeListCacheKey(unstable_serialize((i) => ["prizes", 7, "uid", i])),
    ).toBe(false);
    expect(isChallengeListCacheKey("challenges-page")).toBe(false);
  });

  it("removes only the missing race", () => {
    const page: ChallengeListPage = { items: [item(7), item(8)], hasNext: true };
    expect(removeChallengeFromListCache(page, 7)).toEqual({ items: [item(8)], hasNext: true });
    expect(removeChallengeFromListCache([item(7), item(8)], 7)).toEqual([item(8)]);
  });

  it("집계 캐시(페이지 배열)에서도 해당 레이스를 제거한다", () => {
    const pages: ChallengeListPage[] = [
      { items: [item(1), item(7)], hasNext: true },
      { items: [item(8)], hasNext: false },
    ];

    expect(removeChallengeFromListCache(pages, 7)).toEqual([
      { items: [item(1)], hasNext: true },
      { items: [item(8)], hasNext: false },
    ]);
    // 항목이 없으면 참조를 유지해 불필요한 리렌더를 막는다
    const untouched = removeChallengeFromListCache(pages, 999);
    expect(untouched).toBe(pages);
  });
});
