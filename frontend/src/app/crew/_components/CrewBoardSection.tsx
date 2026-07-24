"use client";

import { useState } from "react";
import type { User } from "firebase/auth";
import { Card } from "@/app/_components/ui/Card";
import { crewNudge, toDisplayError } from "@/lib/api";
import type { CrewView } from "@/lib/api/types";
import { handleAuthFailure } from "@/lib/auth";
import { formatDistance } from "@/lib/units";
import { track } from "@/lib/analytics";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import { toast } from "sonner";
import { BoardRow } from "./BoardRow";

/** 이번 달 보드 — 크루원이 매일 확인하는 핵심(총거리·목표·멤버 넛지)이라 크루 홈 최상단. */
export function CrewBoardSection({ crew, user }: { crew: CrewView; user: User }) {
  const { t } = useLocale();
  const { unit } = useUnit();
  const [nudgedIds, setNudgedIds] = useState<Set<string>>(() => new Set());
  const [nudgingId, setNudgingId] = useState<string | null>(null);

  const monthTotalM = crew.members.reduce((sum, m) => sum + m.monthDistanceM, 0);
  const goalM = crew.monthGoalKm != null ? crew.monthGoalKm * 1000 : null;
  const goalAchievers = goalM != null
    ? crew.members.filter((member) => member.monthDistanceM >= goalM).length
    : 0;
  const crewGoalPercent = crew.members.length > 0
    ? Math.round((goalAchievers / crew.members.length) * 100)
    : 0;

  async function onNudge(targetUserId: string, variant: number) {
    if (nudgingId) return;
    setNudgingId(targetUserId);
    try {
      await crewNudge(targetUserId, variant, user);
      void track("crew_nudge_sent", { variant });
      setNudgedIds((prev) => new Set(prev).add(targetUserId));
      toast.success(t.nudge_sent(t.nudge_presets[variant]));
    } catch (e) {
      const msg = String(e);
      if (msg.includes("nudge_daily_limit")) {
        setNudgedIds((prev) => new Set(prev).add(targetUserId));
        toast.error(t.nudge_already_sent);
      } else if (!handleAuthFailure(e, "/crew")) {
        toast.error(toDisplayError(e) ?? t.error_occurred);
      }
    } finally {
      setNudgingId(null);
    }
  }

  return (
    <Card className="mt-4">
      <div className="flex items-baseline justify-between">
        <div className="text-base font-semibold">{t.crew_month_heading}</div>
        <div className="text-sm text-zinc-500">
          {t.crew_month_total_label}{" "}
          <span className="font-semibold tabular-nums text-zinc-900">
            {formatDistance(monthTotalM, unit)}
          </span>
        </div>
      </div>
      {/* 공통 개인 목표를 달성한 크루원 비율 (리더가 설정한 경우만) */}
      {goalM != null ? (
        <div className="mt-3 rounded-xl bg-zinc-50 p-3">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="font-medium text-zinc-600">{t.crew_goal_label}</span>
            <span className={goalAchievers === crew.members.length ? "font-semibold text-emerald-600" : "tabular-nums text-zinc-500"}>
              {t.crew_goal_achievers(goalAchievers, crew.members.length)}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-zinc-400">
            {t.crew_goal_per_member(formatDistance(goalM, unit))}
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-200">
            <div
              className={`h-full rounded-full transition-all ${goalAchievers === crew.members.length ? "bg-emerald-500" : "bg-zinc-900"}`}
              style={{ width: `${crewGoalPercent}%` }}
            />
          </div>
        </div>
      ) : null}
      <div className="mt-2 divide-y divide-zinc-100">
        {crew.members.map((m, i) => (
          <BoardRow
            key={m.userId}
            rank={i + 1}
            nickname={m.nickname}
            isLeader={m.isLeader}
            isMe={m.isMe}
            monthDistanceM={m.monthDistanceM}
            monthRuns={m.monthRuns}
            goalM={goalM}
            onNudge={(variant) => onNudge(m.userId, variant)}
            nudged={nudgedIds.has(m.userId)}
            nudging={nudgingId === m.userId}
          />
        ))}
      </div>
    </Card>
  );
}
