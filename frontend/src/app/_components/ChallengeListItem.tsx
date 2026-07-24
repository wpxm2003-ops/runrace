"use client";

import { Badge } from "@/app/_components/ui/Badge";
import { ChallengePhaseBadge } from "@/app/_components/ChallengePhaseBadge";
import { challengeDetailHref } from "@/lib/challengeRoute";
import { setChallengePreview } from "@/lib/challengePreview";
import { formatDateRange } from "@/lib/format";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import { formatGoalDistance } from "@/lib/units";
import { useAuthUser } from "@/lib/useAuthUser";
import type { ChallengeListItem as ChallengeListItemType } from "@/lib/api/types";
import { nativeNavigate } from "@/lib/nativeNav";

type Props = {
  challenge: ChallengeListItemType;
  showJoinedBadge?: boolean;
};

export function ChallengeListItem({ challenge: c, showJoinedBadge = false }: Props) {
  const { t, locale } = useLocale();
  const { unit } = useUnit();
  const { user } = useAuthUser();

  return (
    <a
      href={challengeDetailHref(c.id)}
      onPointerDown={() => setChallengePreview(c, user)}
      onClick={(e) => {
        e.preventDefault();
        nativeNavigate(challengeDetailHref(c.id));
      }}
      className="block rounded-xl border border-zinc-200 px-4 py-3 hover:bg-zinc-50"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="truncate text-sm font-medium">{c.title}</div>
          {showJoinedBadge && c.isMember ? (
            <Badge tone="emerald">{c.phase === "ENDED" ? t.races_joined_done : t.races_joined}</Badge>
          ) : null}
        </div>
        <ChallengePhaseBadge
          startAt={c.startAt}
          endAt={c.endAt}
          apiPhase={c.phase}
          compact
        />
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-sm text-zinc-600">
        <span>{t.races_goal_members(formatGoalDistance(c.goalKm, unit), c.memberCount)}</span>
        {/* 경품 표시 — 상태가 아니라 레이스 속성이라 목표·인원 줄에 둔다(제목 줄 혼잡·색 충돌 회피). */}
        {c.hasPrize ? (
          <span
            role="img"
            aria-label={t.races_prize_badge}
            title={t.races_prize_badge}
            className="shrink-0 leading-none"
          >
            🎁
          </span>
        ) : null}
      </div>
      <div className="mt-1 text-xs text-zinc-500">
        {formatDateRange(c.startAt, c.endAt, locale)}
      </div>
    </a>
  );
}
