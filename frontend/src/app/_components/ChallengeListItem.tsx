"use client";

import { ChallengePhaseBadge } from "@/app/_components/ChallengePhaseBadge";
import { challengeDetailHref } from "@/lib/challengeRoute";
import { setChallengePreview } from "@/lib/challengePreview";
import { formatDateRange } from "@/lib/format";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import { formatGoalDistance } from "@/lib/units";
import { useAuthUser } from "@/lib/useAuthUser";
import type { ChallengeListItem as ChallengeListItemType } from "@/lib/api/types";

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
      onClick={() => setChallengePreview(c, user)}
      className="block rounded-xl border border-zinc-200 px-4 py-3 hover:bg-zinc-50"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium">{c.title}</div>
        <div className="flex shrink-0 items-center gap-1.5">
          {showJoinedBadge && c.isMember ? (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
              {c.phase === "ENDED" ? t.races_joined_done : t.races_joined}
            </span>
          ) : null}
          <ChallengePhaseBadge
            startAt={c.startAt}
            endAt={c.endAt}
            apiPhase={c.phase}
          />
        </div>
      </div>
      <div className="mt-1 text-sm text-zinc-600">
        {t.races_goal_members(formatGoalDistance(c.goalKm, unit), c.memberCount)}
      </div>
      <div className="mt-1 text-xs text-zinc-500">
        {formatDateRange(c.startAt, c.endAt, locale)}
      </div>
    </a>
  );
}
