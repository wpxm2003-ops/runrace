"use client";

import { ChallengeListItem } from "@/app/_components/ChallengeListItem";
import { SkeletonLines } from "@/app/_components/ui/Skeleton";
import type { ChallengeListItem as ChallengeListItemType } from "@/lib/api/types";
import { useLocale } from "@/lib/i18n";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";

type ChallengePage = { items: ChallengeListItemType[]; hasNext: boolean };

/** useSWRInfinite 결과에서 목록 렌더링에 필요한 부분만 받는다(공개·내 레이스 공통). */
type InfiniteResult = {
  data?: ChallengePage[];
  size: number;
  setSize: (size: number | ((s: number) => number)) => Promise<unknown> | unknown;
  isLoading: boolean;
  isValidating: boolean;
};

/**
 * 레이스 목록 무한스크롤 — 초기 스켈레톤 / 빈 상태 / 아이템 + 센티넬을 한 곳에서 처리한다.
 * 공개 레이스 목록과 내 레이스 목록이 공통으로 사용한다.
 */
export function ChallengeInfiniteList({
  result,
  emptyLabel,
  skeletonCount = 3,
  showJoinedBadge = false,
  forceLoading = false,
}: {
  result: InfiniteResult;
  emptyLabel: string;
  skeletonCount?: number;
  showJoinedBadge?: boolean;
  /** 인증 복원 대기 등으로 아직 fetch를 시작하지 않은 동안 빈 상태 대신 스켈레톤을 보여준다. */
  forceLoading?: boolean;
}) {
  const { t } = useLocale();
  const { data: pages, size, setSize, isLoading, isValidating } = result;

  const items = pages ? pages.flatMap((p) => p.items) : [];
  const hasNext = pages ? (pages[pages.length - 1]?.hasNext ?? false) : false;
  const initialLoading = (isLoading || forceLoading) && !pages;

  const sentinelRef = useInfiniteScroll({ hasNext, isValidating, setSize, size });

  return (
    <div className="mt-3 grid gap-2">
      {initialLoading ? (
        <SkeletonLines count={skeletonCount} />
      ) : items.length === 0 ? (
        <div className="text-sm text-zinc-600">{emptyLabel}</div>
      ) : (
        <>
          {items.map((c) => (
            <ChallengeListItem key={c.id} challenge={c} showJoinedBadge={showJoinedBadge} />
          ))}
          {hasNext ? (
            <div ref={sentinelRef} className="py-3 text-center text-sm text-zinc-400">
              {t.loading}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
