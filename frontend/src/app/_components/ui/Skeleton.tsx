/** 데이터를 기다리는 동안 콘텐츠 형태를 유지하는 플레이스홀더. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-zinc-200 ${className ?? ""}`}
      aria-hidden="true"
    />
  );
}

/** 리스트 아이템 형태의 스켈레톤 (챌린지·운동 목록 공용). */
export function SkeletonListItem() {
  return (
    <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-12" />
      </div>
      <Skeleton className="mt-2 h-3 w-48" />
      <Skeleton className="mt-1.5 h-3 w-28" />
    </div>
  );
}

/** 카드 안 여러 줄 스켈레톤. */
export function SkeletonLines({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-2">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonListItem key={i} />
      ))}
    </div>
  );
}
