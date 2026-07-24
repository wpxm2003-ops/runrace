"use client";

import type { User } from "firebase/auth";
import { Badge } from "@/app/_components/ui/Badge";
import { Card } from "@/app/_components/ui/Card";
import { useCrewRaces } from "@/lib/api";
import { challengeDetailHref } from "@/lib/challengeRoute";
import { formatDateRange } from "@/lib/format";
import { formatGoalDistance } from "@/lib/units";
import { nativeNavigate } from "@/lib/nativeNav";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";

/** 크루 레이스 — 크루원끼리만 겨루는 내부 레이스 미리보기(최근 목록 + 전체보기). */
export function CrewRacesSection({ user }: { user: User }) {
  const { t, locale } = useLocale();
  const { unit } = useUnit();
  const { data: races } = useCrewRaces(user, true);

  return (
    <Card className="mt-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-base font-semibold">{t.crew_races_heading}</div>
        <button
          type="button"
          onClick={() => nativeNavigate("/crew/races")}
          className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
        >
          {t.crew_races_view_all}
        </button>
      </div>
      <div className="mt-3">
        {!races || races.length === 0 ? (
          <p className="text-sm text-zinc-500">{t.crew_races_empty}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {races.map((r) => {
              const phaseLabel =
                r.phase === "IN_PROGRESS"
                  ? t.races_filter_in_progress
                  : r.phase === "ENDED"
                    ? t.races_filter_ended
                    : t.races_filter_scheduled;
              const phaseTone =
                r.phase === "IN_PROGRESS"
                  ? "bg-sky-100 text-sky-700"
                  : r.phase === "ENDED"
                    ? "bg-zinc-100 text-zinc-500"
                    : "bg-amber-100 text-amber-700";
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => nativeNavigate(challengeDetailHref(r.id))}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-zinc-100 p-3 text-left hover:bg-zinc-50"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-zinc-900">{r.title}</span>
                      {r.isMember ? <Badge tone="emerald">{t.races_joined}</Badge> : null}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-500">
                      <span>{t.races_goal_members(formatGoalDistance(r.goalKm, unit), r.memberCount)}</span>
                      {/* 경품 표시 — 목록 아이템과 동일하게 목표·인원 줄에(상태 뱃지와 분리). */}
                      {r.hasPrize ? (
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
                    <div className="mt-0.5 text-[11px] text-zinc-400">
                      {formatDateRange(r.startAt, r.endAt, locale)}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${phaseTone}`}>
                    {phaseLabel}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
