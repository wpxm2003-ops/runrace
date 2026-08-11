import { describe, expect, it } from "vitest";
import { initCache, serialize } from "swr/_internal";
import { unstable_serialize } from "swr/infinite";
import type { ChallengeListItem, ChallengeListPage } from "@/lib/api/types";
import {
  isChallengeListCacheKey,
  removeChallengeFromListCaches,
  removeChallengeFromListCache,
  revalidateChallengeInfiniteListCaches,
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

  it("clears every loaded page before revalidating an infinite aggregate", async () => {
    const cache = new Map<string, Record<string, unknown>>();
    const initialized = initCache(cache);
    expect(initialized).toBeDefined();
    const mutate = initialized![1];
    const cleanup = initialized![3];
    const page0Arg = ["challenges-page", null, "ko", "active", 0] as const;
    const page1Arg = ["challenges-page", null, "ko", "active", 1] as const;
    const crewPageArg = ["crew-races", "uid", "active", 0] as const;
    const page0Key = serialize(page0Arg)[0];
    const page1Key = serialize(page1Arg)[0];
    const crewPageKey = serialize(crewPageArg)[0];
    const aggregateKey = unstable_serialize(
      (i) => ["challenges-page", null, "ko", "active", i],
    );
    const page0 = { items: [item(1)], hasNext: true };
    const page1 = { items: [item(2)], hasNext: false };

    cache.set(page0Key, { data: page0, _k: page0Arg });
    cache.set(page1Key, { data: page1, _k: page1Arg });
    cache.set(crewPageKey, { data: page0, _k: crewPageArg });
    cache.set(aggregateKey, { data: [page0, page1], _k: page0Arg });

    try {
      await revalidateChallengeInfiniteListCaches(mutate, cache.keys(), [
        "challenges-page",
        "challenges-mine-page",
      ]);

      expect(cache.get(page0Key)?.data).toBeUndefined();
      expect(cache.get(page1Key)?.data).toBeUndefined();
      expect(cache.get(crewPageKey)?.data).toEqual(page0);
      expect(cache.get(aggregateKey)?.data).toEqual([page0, page1]);
    } finally {
      cleanup?.();
    }
  });

  it("updates real SWR infinite aggregates explicitly and clears their page entries", async () => {
    const cache = new Map<string, Record<string, unknown>>();
    const initialized = initCache(cache);
    expect(initialized).toBeDefined();
    const mutate = initialized![1];
    const cleanup = initialized![3];

    const publicPageArg = ["challenges-page", null, "ko", "active", 0] as const;
    const minePageArg = ["challenges-mine-page", "uid", "active", 0] as const;
    const crewPageArg = ["crew-races", "uid", "active", 0] as const;
    const crewHomeArg = ["crew-races", "uid", "home"] as const;
    const publicPageKey = serialize(publicPageArg)[0];
    const minePageKey = serialize(minePageArg)[0];
    const crewPageKey = serialize(crewPageArg)[0];
    const crewHomeKey = serialize(crewHomeArg)[0];
    const publicAggregateKey = unstable_serialize(
      (i) => ["challenges-page", null, "ko", "active", i],
    );
    const mineAggregateKey = unstable_serialize(
      (i) => ["challenges-mine-page", "uid", "active", i],
    );
    const crewAggregateKey = unstable_serialize(
      (i) => ["crew-races", "uid", "active", i],
    );
    const unrelatedKey = serialize(["challenge", 7, "uid"])[0];
    const page = { items: [item(7), item(8)], hasNext: false };

    cache.set(publicPageKey, { data: page, _k: publicPageArg });
    cache.set(minePageKey, { data: page, _k: minePageArg });
    cache.set(crewPageKey, { data: page, _k: crewPageArg });
    cache.set(crewHomeKey, { data: [item(7), item(8)], _k: crewHomeArg });
    cache.set(publicAggregateKey, { data: [page], _k: publicPageArg });
    cache.set(mineAggregateKey, { data: [page], _k: minePageArg });
    cache.set(crewAggregateKey, { data: [page], _k: crewPageArg });
    cache.set(unrelatedKey, { data: { id: 7 }, _k: ["challenge", 7, "uid"] });

    try {
      await removeChallengeFromListCaches(mutate, cache.keys(), 7);

      for (const key of [publicAggregateKey, mineAggregateKey, crewAggregateKey]) {
        expect(cache.get(key)?.data).toEqual([
          { items: [item(8)], hasNext: false },
        ]);
      }
      for (const key of [publicPageKey, minePageKey, crewPageKey]) {
        expect(cache.get(key)?.data).toBeUndefined();
      }
      expect(cache.get(crewHomeKey)?.data).toEqual([item(8)]);
      expect(cache.get(unrelatedKey)?.data).toEqual({ id: 7 });
    } finally {
      cleanup?.();
    }
  });
});
