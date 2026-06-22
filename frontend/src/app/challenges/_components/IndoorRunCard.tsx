"use client";

import type { PendingApproval, RejectedApproval } from "@/lib/api/types";
import { formatDistance } from "@/lib/units";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import { formatDuration } from "@/lib/workoutTrack";

type ImageThumbnailProps = {
  imageUrl: string;
  onExpand: (url: string) => void;
  ariaLabel: string;
};

function ImageThumbnail({ imageUrl, onExpand, ariaLabel }: ImageThumbnailProps) {
  return (
    <button
      type="button"
      onClick={() => onExpand(imageUrl)}
      className="h-14 w-14 shrink-0 overflow-hidden rounded-lg ring-offset-1 hover:ring-2 hover:ring-zinc-300"
      aria-label={ariaLabel}
    >
      <img src={imageUrl} alt="" className="h-full w-full object-cover" />
    </button>
  );
}

type PendingRunCardProps = {
  item: PendingApproval;
  votingId: number | null;
  onVote: (workoutId: number, approved: boolean) => void;
  onExpandImage: (url: string | null) => void;
};

export function PendingRunCard({ item, votingId, onVote, onExpandImage }: PendingRunCardProps) {
  const { t } = useLocale();
  const { unit } = useUnit();

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-zinc-900">
            {item.submitterNickname ?? t.no_name}
          </div>
          <div className="mt-0.5 text-xs text-zinc-500">
            {formatDistance(item.distanceM, unit)} · {formatDuration(item.durationSec)} · {t.pending_approval_votes(item.approvedCount, item.totalVoters)}
          </div>
        </div>
        {item.imageUrl ? (
          <ImageThumbnail
            imageUrl={item.imageUrl}
            onExpand={onExpandImage}
            ariaLabel={t.pending_approval_view_image}
          />
        ) : null}
      </div>
      <div className="mt-2 flex gap-2">
        {!item.canVote ? (
          <div className="text-xs font-medium text-zinc-500">
            {t.pending_approval_waiting}
          </div>
        ) : item.myVote === null ? (
          <>
            <button
              type="button"
              disabled={votingId === item.workoutId}
              onClick={() => onVote(item.workoutId, true)}
              className="flex-1 rounded-lg bg-emerald-600 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {t.pending_approval_approve}
            </button>
            <button
              type="button"
              disabled={votingId === item.workoutId}
              onClick={() => onVote(item.workoutId, false)}
              className="flex-1 rounded-lg border border-red-200 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {t.pending_approval_reject}
            </button>
          </>
        ) : (
          <div className={`text-xs font-medium ${item.myVote ? "text-emerald-600" : "text-red-500"}`}>
            {item.myVote ? t.pending_approval_approved : t.pending_approval_rejected}
          </div>
        )}
      </div>
    </div>
  );
}

type RejectedRunCardProps = {
  item: RejectedApproval;
  onExpandImage: (url: string | null) => void;
};

export function RejectedRunCard({ item, onExpandImage }: RejectedRunCardProps) {
  const { t } = useLocale();
  const { unit } = useUnit();

  return (
    <div className="rounded-xl border border-red-100 bg-red-50/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-zinc-900">
            {item.submitterNickname ?? t.no_name}
          </div>
          <div className="mt-0.5 text-xs text-zinc-500">
            {formatDistance(item.distanceM, unit)}
          </div>
          {item.rejectorNicknames.length > 0 ? (
            <div className="mt-1 text-xs font-medium text-red-600">
              {t.rejected_approval_by(item.rejectorNicknames.join(", "))}
            </div>
          ) : null}
        </div>
        {item.imageUrl ? (
          <ImageThumbnail
            imageUrl={item.imageUrl}
            onExpand={onExpandImage}
            ariaLabel={t.pending_approval_view_image}
          />
        ) : null}
      </div>
    </div>
  );
}
