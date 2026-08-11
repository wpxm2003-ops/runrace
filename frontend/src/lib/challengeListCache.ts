import type { ChallengeListItem, ChallengeListPage } from "@/lib/api/types";

export type ChallengeListCacheData =
  | ChallengeListPage
  | ChallengeListItem[]
  | ChallengeListPage[]
  | undefined;

const LIST_KEY_NAMES = ["challenges-page", "challenges-mine-page", "crew-races"] as const;

/**
 * 레이스 목록 캐시 키 판정 — 페이지별 배열 키와 useSWRInfinite의 집계 키를 모두 잡는다.
 *
 * useSWRInfinite는 화면이 실제로 읽는 데이터를 페이지 키가 아니라 별도의 직렬화 문자열
 * 키("$inf$…")에 집계해 둔다. 배열 키만 매칭하면 페이지 캐시는 고쳐도 집계가 남아,
 * 삭제된 레이스가 앱을 켜둔 화면에 계속 보인다(실측 리뷰 지적).
 */
export function isChallengeListCacheKey(key: unknown): boolean {
  if (Array.isArray(key)) {
    return (LIST_KEY_NAMES as readonly string[]).includes(key[0]);
  }
  return (
    typeof key === "string"
    && key.startsWith("$inf$")
    && LIST_KEY_NAMES.some((name) => key.includes(`"${name}"`))
  );
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
