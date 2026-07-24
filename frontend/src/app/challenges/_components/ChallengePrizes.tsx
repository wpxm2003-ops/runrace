"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { toast } from "sonner";
import type { PrizeResult, PrizeRow } from "@/lib/api/types";
import { usePrizes, invalidatePrizes } from "@/lib/api/hooks";
import { fetchMyPrizeResult, fetchPrizeImageObjectUrl } from "@/lib/api/prizes";
import { handleAuthFailure } from "@/lib/auth";
import { useLocale } from "@/lib/i18n";
import { ImageLightbox } from "@/app/_components/ImageLightbox";

export function ChallengePrizes({
  challengeId,
  user,
  hasEnded,
  myRank,
}: {
  challengeId: number;
  user: User | null;
  hasEnded: boolean;
  myRank: number | null;
}) {
  const { t } = useLocale();
  const { data: prizes } = usePrizes(challengeId, user);
  const [open, setOpen] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [loadingRank, setLoadingRank] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<PrizeResult | null>(null);

  useEffect(() => {
    return () => {
      if (viewerUrl) URL.revokeObjectURL(viewerUrl);
    };
  }, [viewerUrl]);

  if (!prizes || prizes.length === 0) return null;
  const awardType = prizes[0].awardType;

  async function openPrizeImage(rank: number) {
    if (!user) return;
    setLoadingRank(rank);
    try {
      const url = await fetchPrizeImageObjectUrl(challengeId, rank, user);
      setViewerUrl(url);
      void invalidatePrizes(challengeId);
    } catch (error) {
      if (handleAuthFailure(error)) return;
      toast.error(t.prize_load_error);
    } finally {
      setLoadingRank(null);
    }
  }

  async function checkRandomResult() {
    if (!user) {
      toast.info(t.prize_login_required);
      return;
    }
    setChecking(true);
    try {
      const next = await fetchMyPrizeResult(challengeId, user);
      setResult(next);
      if (next.status === "BEFORE_END") toast.info(t.prize_random_before_end);
      if (next.status === "NOT_ELIGIBLE") toast.info(t.prize_random_not_eligible);
      if (next.status === "NOT_WINNER") toast.info(t.prize_random_not_winner);
      if (next.status === "WINNER") toast.success(t.prize_random_winner(next.prizeName ?? ""));
    } catch (error) {
      if (handleAuthFailure(error)) return;
      toast.error(t.prize_result_error);
    } finally {
      setChecking(false);
    }
  }

  function onRankPrizeClick(prize: PrizeRow) {
    if (!prize.hasImage) return;
    if (hasEnded && myRank === prize.rank) {
      void openPrizeImage(prize.rank);
    } else if (!hasEnded) {
      toast.info(t.prize_locked_before_end);
    } else {
      toast.info(t.prize_locked_not_winner(prize.rank));
    }
  }

  const wonPrize =
    result?.status === "WINNER"
      ? prizes.find((prize) => prize.rank === result.prizeRank) ?? null
      : null;

  return (
    <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between font-medium"
      >
        <span>{t.prize_view_toggle(prizes.length)}</span>
        <span className="text-amber-700">{open ? "▲" : "▼"}</span>
      </button>

      {open && awardType === "RANDOM_FINISHER" ? (
        <div className="mt-3">
          <p className="text-xs leading-relaxed text-amber-800">{t.prize_random_public_hint}</p>
          <button
            type="button"
            disabled={checking}
            onClick={() => void checkRandomResult()}
            className="mt-3 w-full rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {checking ? t.prize_checking : t.prize_check_result}
          </button>
          {wonPrize ? (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-white px-3 py-2">
              <span className="min-w-0 flex-1 truncate font-semibold">{wonPrize.name}</span>
              {wonPrize.hasImage ? (
                <button
                  type="button"
                  disabled={loadingRank === wonPrize.rank}
                  onClick={() => void openPrizeImage(wonPrize.rank)}
                  className="shrink-0 rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
                >
                  {loadingRank === wonPrize.rank ? t.prize_opening : t.prize_view_image}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {open && awardType === "RANK" ? (
        <ul className="mt-2 space-y-1.5">
          {prizes.map((prize) => {
            const canView = hasEnded && myRank === prize.rank;
            return (
              <li key={prize.rank} className="flex items-center gap-2">
                <span className="font-semibold">{t.prize_rank_label(prize.rank)}</span>
                <span className="min-w-0 flex-1 truncate">{prize.name}</span>
                {prize.hasImage ? (
                  <button
                    type="button"
                    disabled={loadingRank === prize.rank}
                    onClick={() => onRankPrizeClick(prize)}
                    className={
                      canView
                        ? "shrink-0 rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
                        : "shrink-0 rounded-lg border border-amber-300 px-2.5 py-1 text-xs text-amber-700"
                    }
                  >
                    {canView
                      ? loadingRank === prize.rank
                        ? t.prize_opening
                        : prize.viewed
                          ? t.prize_view_again
                          : t.prize_view_image
                      : "잠김"}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {viewerUrl ? (
        <ImageLightbox
          imageUrls={[viewerUrl]}
          alt={t.prize_viewer_alt}
          onClose={() => setViewerUrl(null)}
          zIndexClass="z-[120]"
        />
      ) : null}
    </div>
  );
}
