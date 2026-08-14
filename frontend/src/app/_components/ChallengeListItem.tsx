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
  /** 크루 레이스 전용 화면에선 끈다 — 전 행이 크루 레이스라 라벨이 정보가 아니다. */
  showCrewBadge?: boolean;
};

export function ChallengeListItem({
  challenge: c,
  showJoinedBadge = false,
  showCrewBadge = true,
}: Props) {
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
      className="block rounded-card border border-line bg-panel px-4 py-3.5 shadow-card transition-[background-color,border-color,transform] hover:border-brand/35 hover:bg-panel-muted active:scale-[0.995]"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="truncate text-sm font-bold text-ink">{c.title}</div>
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
      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
        <span>{t.races_goal_members(formatGoalDistance(c.goalKm, unit), c.memberCount)}</span>
        {/* 크루 전용 표시 — 내 레이스 목록은 공개·크루 레이스가 섞여 나와 구분이 필요하다. */}
        {showCrewBadge && c.crewOnly ? <Badge tone="brown">{t.races_crew_badge}</Badge> : null}
        {/* 내기·경품 표시 — 상태가 아니라 레이스 속성이라 목표·인원 줄에 둔다. */}
        {c.hasPrize || c.hasStake ? (
          <span
            role="img"
            aria-label={c.hasPrize ? t.races_prize_badge : t.detail_stake_label}
            title={c.hasPrize ? t.races_prize_badge : t.detail_stake_label}
            className="shrink-0 leading-none"
          >
            🎁
          </span>
        ) : null}
      </div>
      <div className="mt-1 text-[11px] text-muted">
        {formatDateRange(c.startAt, c.endAt, locale)}
      </div>
    </a>
  );
}
