import type { ChallengeListItem, ChallengeListPage } from "@/lib/api/types";
import type { ScopedMutator } from "swr";

export type ChallengeListCacheData =
  | ChallengeListPage
  | ChallengeListItem[]
  | ChallengeListPage[]
  | undefined;

export const CHALLENGE_LIST_KEY_NAMES = [
  "challenges-page",
  "challenges-mine-page",
  "crew-races",
] as const;

export type ChallengeListKeyName = (typeof CHALLENGE_LIST_KEY_NAMES)[number];

function hasListKeyName(
  value: unknown,
  keyNames: readonly ChallengeListKeyName[] = CHALLENGE_LIST_KEY_NAMES,
): value is ChallengeListKeyName {
  return typeof value === "string" && (keyNames as readonly string[]).includes(value);
}

/**
 * Classifies race-list cache key shapes. Do not pass this directly to a filtered
 * SWR mutation: SWR excludes `$inf$` keys before it invokes the predicate.
 */
export function isChallengeListCacheKey(key: unknown): boolean {
  return Array.isArray(key)
    ? hasListKeyName(key[0])
    : isChallengeInfiniteAggregateKey(key);
}

/** SWR skips these special aggregate keys when mutate is called with a filter. */
export function isChallengeInfiniteAggregateKey(
  key: unknown,
  keyNames: readonly ChallengeListKeyName[] = CHALLENGE_LIST_KEY_NAMES,
): key is string {
  return (
    typeof key === "string" &&
    keyNames.some((name) => key.startsWith(`$inf$@"${name}",`))
  );
}

export function challengeInfiniteAggregateKeys(
  serializedKeys: Iterable<string>,
  keyNames: readonly ChallengeListKeyName[] = CHALLENGE_LIST_KEY_NAMES,
): string[] {
  return Array.from(serializedKeys).filter((key) =>
    isChallengeInfiniteAggregateKey(key, keyNames),
  );
}

/** Page entries used internally by useSWRInfinite. Crew home is a normal list, not a page. */
export function isChallengeInfinitePageKey(
  key: unknown,
  keyNames: readonly ChallengeListKeyName[] = CHALLENGE_LIST_KEY_NAMES,
): boolean {
  return (
    Array.isArray(key) &&
    hasListKeyName(key[0], keyNames) &&
    typeof key[key.length - 1] === "number"
  );
}

export function isCrewRaceHomeKey(key: unknown): boolean {
  return Array.isArray(key) && key[0] === "crew-races" && key[2] === "home";
}

function removeFromPage(page: ChallengeListPage, challengeId: number): ChallengeListPage {
  if (!page?.items) return page;
  const items = page.items.filter((item) => item.id !== challengeId);
  return items.length === page.items.length ? page : { ...page, items };
}

export function removeChallengeFromListCache(
  cached: ChallengeListCacheData,
  challengeId: number,
): ChallengeListCacheData {
  if (Array.isArray(cached)) {
    // $inf$ 집계 캐시는 "페이지의 배열"이다 — 항목 배열과 원소 모양(items 유무)으로 구분한다.
    if (cached.length > 0 && cached[0] != null && typeof cached[0] === "object" && "items" in cached[0]) {
      const pages = (cached as ChallengeListPage[]).map((page) => removeFromPage(page, challengeId));
      return pages.some((page, i) => page !== cached[i]) ? pages : cached;
    }
    const items = (cached as ChallengeListItem[]).filter((item) => item.id !== challengeId);
    return items.length === cached.length ? cached : items;
  }
  if (!cached?.items) return cached;
  return removeFromPage(cached, challengeId);
}

/** Revalidate every loaded page, including pages after the first one. */
export async function revalidateChallengeInfiniteListCaches(
  mutate: ScopedMutator,
  serializedKeys: Iterable<string>,
  keyNames: readonly ChallengeListKeyName[],
): Promise<void> {
  const aggregateKeys = challengeInfiniteAggregateKeys(serializedKeys, keyNames);

  await mutate<ChallengeListCacheData>(
    (key) => isChallengeInfinitePageKey(key, keyNames),
    undefined,
    { revalidate: false },
  );
  await Promise.all(aggregateKeys.map((key) => mutate(key)));
}

/**
 * Remove a server-confirmed missing race from every visible list immediately.
 *
 * SWR deliberately excludes `$inf$` keys from filter mutations. We therefore
 * snapshot and mutate aggregate keys explicitly, clear their page entries, and
 * then revalidate the mounted aggregates so pagination is filled from the server.
 */
export async function removeChallengeFromListCaches(
  mutate: ScopedMutator,
  serializedKeys: Iterable<string>,
  challengeId: number,
): Promise<void> {
  const aggregateKeys = challengeInfiniteAggregateKeys(serializedKeys);
  const removeMissing = (cached: ChallengeListCacheData) =>
    removeChallengeFromListCache(cached, challengeId);

  await Promise.all(
    aggregateKeys.map((key) =>
      mutate<ChallengeListCacheData>(key, removeMissing, { revalidate: false }),
    ),
  );

  // Missing page data makes a mounted useSWRInfinite fetch every loaded page again.
  await mutate<ChallengeListCacheData>(isChallengeInfinitePageKey, undefined, {
    revalidate: false,
  });

  // The crew home list is a regular SWR array and should stay visible while updating.
  await mutate<ChallengeListCacheData>(isCrewRaceHomeKey, removeMissing, {
    revalidate: false,
  });

  await Promise.all(aggregateKeys.map((key) => mutate(key)));
}
