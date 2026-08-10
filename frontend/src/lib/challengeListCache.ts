import type { ChallengeListItem, ChallengeListPage } from "@/lib/api/types";

export type ChallengeListCacheData = ChallengeListPage | ChallengeListItem[] | undefined;

export function isChallengeListCacheKey(key: unknown): boolean {
  return (
    Array.isArray(key) &&
    (key[0] === "challenges-page" ||
      key[0] === "challenges-mine-page" ||
      key[0] === "crew-races")
  );
}

export function removeChallengeFromListCache(
  cached: ChallengeListCacheData,
  challengeId: number,
): ChallengeListCacheData {
  if (Array.isArray(cached)) {
    const items = cached.filter((item) => item.id !== challengeId);
    return items.length === cached.length ? cached : items;
  }
  if (!cached?.items) return cached;
  const items = cached.items.filter((item) => item.id !== challengeId);
  return items.length === cached.items.length ? cached : { ...cached, items };
}
