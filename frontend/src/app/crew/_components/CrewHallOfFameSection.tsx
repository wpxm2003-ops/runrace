"use client";

import type { User } from "firebase/auth";
import { Card } from "@/app/_components/ui/Card";
import { useCrewInsights } from "@/lib/api";
import { formatDistance } from "@/lib/units";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import { useCollapsibleList } from "@/lib/useCollapsibleList";
import { ShowMoreToggle } from "@/app/_components/ui/ShowMoreToggle";

/** 접힌 상태에서 보여줄 최근 개월 수 — 나머지는 펼치기로 확인한다. */
const COLLAPSED_MONTHS = 3;

/** 명예의 전당 — 월별 MVP 히스토리(완결된 달만, 최신월 우선 최대 12개월). */
export function CrewHallOfFameSection({ user }: { user: User }) {
  const { t } = useLocale();
  const { unit } = useUnit();
  const { data: insights } = useCrewInsights(user, true);
  const hallOfFame = insights?.hallOfFame ?? [];
  const { visible, hiddenCount, expanded, toggle } =
    useCollapsibleList(hallOfFame, COLLAPSED_MONTHS);
  if (hallOfFame.length === 0) return null;

  return (
    <Card className="mt-4">
      <div className="text-base font-semibold">{t.crew_hof_heading}</div>
      <div className="mt-2 divide-y divide-zinc-100">
        {visible.map((h) => (
          <div key={h.month} className="flex items-center justify-between gap-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="shrink-0 text-sm">🏆</span>
              <span className="shrink-0 text-xs tabular-nums text-zinc-400">
                {h.month.replace("-", ".")}
              </span>
              <span className="truncate text-sm font-medium text-zinc-900">
                {h.nickname ?? t.no_name}
              </span>
            </div>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-zinc-900">
              {formatDistance(h.distanceM, unit)}
            </span>
          </div>
        ))}
      </div>
      {hiddenCount > 0 ? (
        <ShowMoreToggle
          open={expanded}
          onToggle={toggle}
          moreLabel={t.crew_hof_show_more(hiddenCount)}
          lessLabel={t.list_show_less}
        />
      ) : null}
    </Card>
  );
}
