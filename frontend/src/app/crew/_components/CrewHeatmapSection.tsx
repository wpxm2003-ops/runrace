"use client";

import type { User } from "firebase/auth";
import { Card } from "@/app/_components/ui/Card";
import { useCrewInsights } from "@/lib/api";
import { monthOnlyLabel } from "@/lib/format";
import { useLocale } from "@/lib/i18n";
import { HeatmapGrid } from "./HeatmapGrid";

/** 크루 잔디 — 이번 달 캘린더 히트맵(달마다 모양이 자연히 달라짐, 이번 달 보드 바로 아래). */
export function CrewHeatmapSection({ user }: { user: User }) {
  const { t, locale } = useLocale();
  const { data: insights } = useCrewInsights(user, true);
  if (!insights) return null;

  return (
    <Card className="mt-4">
      <div className="flex items-baseline justify-between">
        <div className="text-base font-semibold">{t.crew_heatmap_heading}</div>
        <div className="text-xs text-zinc-400">{monthOnlyLabel(insights.heatmapFrom, locale)}</div>
      </div>
      <div className="mt-3">
        <HeatmapGrid insights={insights} />
      </div>
    </Card>
  );
}
