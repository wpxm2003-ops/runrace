"use client";

import type { ReactNode } from "react";
import { SkeletonLines } from "./Skeleton";

/**
 * "로딩 중이면 스켈레톤, 비어 있으면 안내 문구, 아니면 목록" 3분기 — shoes/my/rivals가
 * 각자 동일한 형태로 구현하던 것을 공유한다. 에러 표시는 콜사이트마다 위치·소스가 달라
 * (별도 actionError 등) 이 컴포넌트 범위 밖 — 호출부가 그대로 따로 렌더링한다.
 */
export function AsyncList<T>({
  isLoading,
  data,
  isEmpty,
  emptyMessage,
  skeletonCount,
  children,
}: {
  isLoading: boolean;
  data: T | null | undefined;
  isEmpty: (data: T) => boolean;
  emptyMessage: string;
  skeletonCount: number;
  children: (data: T) => ReactNode;
}) {
  if (isLoading && !data) return <SkeletonLines count={skeletonCount} />;
  if (!data || isEmpty(data)) return <div className="text-sm text-zinc-600">{emptyMessage}</div>;
  return <>{children(data)}</>;
}
