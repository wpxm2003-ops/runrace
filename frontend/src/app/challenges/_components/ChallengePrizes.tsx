"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { toast } from "sonner";
import type { PrizeRow } from "@/lib/api/types";
import { usePrizes, invalidatePrizes } from "@/lib/api/hooks";
import { fetchPrizeImageObjectUrl } from "@/lib/api/prizes";
import { handleAuthFailure } from "@/lib/auth";
import { useLocale } from "@/lib/i18n";
import { useNativeBack } from "@/lib/useNativeBack";

/**
 * 레이스 상세의 경품 섹션.
 * - 경품명은 전체 공개(접기/펼치기).
 * - 기프티콘 이미지는 종료 후 + 내가 그 등수 당첨자일 때만 "기프티콘 보기" 노출.
 *   실제 접근 권한은 서버가 재검증한다(프론트는 버튼 노출만 제어).
 */
export function ChallengePrizes({
  challengeId,
  user,
  hasEnded,
  myRank,
}: {
  challengeId: number;
  user: User | null;
  hasEnded: boolean;
  /** 종료 시 내 확정 순위(없거나 진행 중이면 null). */
  myRank: number | null;
}) {
  const { t } = useLocale();
  const { data: prizes } = usePrizes(challengeId, user);
  const [open, setOpen] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [loadingRank, setLoadingRank] = useState<number | null>(null);

  // 뷰어 object URL 해제.
  useEffect(() => {
    return () => {
      if (viewerUrl) URL.revokeObjectURL(viewerUrl);
    };
  }, [viewerUrl]);

  if (!prizes || prizes.length === 0) return null;

  async function openGifticon(rank: number) {
    if (!user) return;
    setLoadingRank(rank);
    try {
      const url = await fetchPrizeImageObjectUrl(challengeId, rank, user);
      setViewerUrl(url);
      // 서버가 첫 열람 시 viewed를 기록하므로 캐시를 갱신해 라벨을 '다시 보기'로 바꾼다.
      void invalidatePrizes(challengeId);
    } catch (e) {
      if (handleAuthFailure(e)) return; // 401 → 로그인 유도
      toast.error(t.prize_load_error);
    } finally {
      setLoadingRank(null);
    }
  }

  // 누구나 선물상자를 누를 수 있게 하되, 자격이 안 되면 이유를 얼럿으로 안내한다.
  // (실제 이미지 접근은 서버가 종료+등수로 재검증한다.)
  function onPrizeClick(p: PrizeRow) {
    if (!p.hasImage) return;
    if (hasEnded && myRank === p.rank) {
      void openGifticon(p.rank);
      return;
    }
    if (!hasEnded) {
      toast.info(t.prize_locked_before_end);
    } else {
      toast.info(t.prize_locked_not_winner(p.rank));
    }
  }

  return (
    <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between font-medium"
      >
        <span>{t.prize_view_toggle(prizes.length)}</span>
        <span className="text-amber-700">{open ? "▴" : "▾"}</span>
      </button>

      {open ? (
        <ul className="mt-2 space-y-1.5">
          {prizes.map((p) => {
            const canView = hasEnded && myRank === p.rank;
            return (
              <li key={p.rank} className="flex items-center gap-2">
                <span className="font-semibold">{t.prize_rank_label(p.rank)}</span>
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {p.hasImage ? (
                  <button
                    type="button"
                    disabled={loadingRank === p.rank}
                    onClick={() => onPrizeClick(p)}
                    className={
                      canView
                        ? "shrink-0 rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
                        : "shrink-0 rounded-lg border border-amber-300 px-2.5 py-1 text-xs text-amber-700"
                    }
                  >
                    {canView
                      ? loadingRank === p.rank
                        ? t.prize_opening
                        : p.viewed
                          ? t.prize_view_again
                          : t.prize_view_gifticon
                      : "🎁"}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {viewerUrl ? <GifticonViewer url={viewerUrl} onClose={() => setViewerUrl(null)} /> : null}
    </div>
  );
}

/** 기프티콘 전체화면 뷰어. */
function GifticonViewer({ url, onClose }: { url: string; onClose: () => void }) {
  const { t } = useLocale();
  useNativeBack(onClose);
  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={t.prize_close}
        className="absolute right-4 top-4 rounded-lg bg-white/15 px-3 py-1.5 text-sm text-white"
      >
        ✕
      </button>
      <img
        src={url}
        alt={t.prize_viewer_alt}
        className="max-h-full max-w-full rounded-xl object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
