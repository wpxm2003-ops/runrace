"use client";

import type { User } from "firebase/auth";
import { Card } from "@/app/_components/ui/Card";
import { useCrewInsights } from "@/lib/api";
import { formatDistance } from "@/lib/units";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";

/** 명예의 전당 — 월별 MVP 히스토리(완결된 달만). */
export function CrewHallOfFameSection({ user }: { user: User }) {
  const { t } = useLocale();
  const { unit } = useUnit();
  const { data: insights } = useCrewInsights(user, true);
  const hallOfFame = insights?.hallOfFame ?? [];
  if (hallOfFame.length === 0) return null;

  return (
    <Card className="mt-4">
      <div className="text-base font-semibold">{t.crew_hof_heading}</div>
      <div className="mt-2 divide-y divide-zinc-100">
        {hallOfFame.map((h) => (
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
    </Card>
  );
}
