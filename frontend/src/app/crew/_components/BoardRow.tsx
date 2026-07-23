"use client";

import { useState } from "react";
import { Badge } from "@/app/_components/ui/Badge";
import { formatDistance } from "@/lib/units";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import { toast } from "sonner";

/**
 * 월간 보드 한 줄 — 순위·닉네임(리더/나 뱃지)·거리·횟수. 0km는 흐리게 + 콕 찌르기(레이스 넛지 UI 패턴).
 * 프리셋 칩은 행 안에서 인라인 확장(ChallengeLeaderboard와 동일 인터랙션).
 */
export function BoardRow({
  rank,
  nickname,
  isLeader,
  isMe,
  monthDistanceM,
  monthRuns,
  goalM,
  onNudge,
  nudged,
  nudging,
}: {
  rank: number;
  nickname: string | null;
  isLeader: boolean;
  isMe: boolean;
  monthDistanceM: number;
  monthRuns: number;
  goalM: number | null;
  onNudge?: (variant: number) => void;
  nudged: boolean;
  nudging: boolean;
}) {
  const { t } = useLocale();
  const { unit } = useUnit();
  const [pickerOpen, setPickerOpen] = useState(false);
  const idle = monthDistanceM === 0;
  const goalPercent = goalM != null ? Math.min(100, Math.round((monthDistanceM / goalM) * 100)) : null;
  const goalReached = goalM != null && monthDistanceM >= goalM;
  const showNudge = !isMe && onNudge;
  return (
    <div className={`py-2.5 ${idle && !showNudge ? "opacity-50" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <div className={`flex min-w-0 items-center gap-2.5 ${idle ? "opacity-60" : ""}`}>
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-500">
            {rank}
          </span>
          <span className="truncate text-sm font-medium text-zinc-900">
            {nickname ?? t.no_name}
          </span>
          {isLeader ? <Badge tone="amber">{t.crew_leader_badge}</Badge> : null}
          {isMe ? <Badge tone="emerald">{t.crew_me_badge}</Badge> : null}
        </div>
        <div className="shrink-0 text-right">
          {idle ? (
            <span className="text-xs text-zinc-400">{t.crew_no_record_yet}</span>
          ) : (
            <>
              <span className="text-sm font-semibold tabular-nums text-zinc-900">
                {formatDistance(monthDistanceM, unit)}
              </span>
              <span className="ml-1.5 text-xs text-zinc-400">{t.crew_month_runs(monthRuns)}</span>
            </>
          )}
        </div>
      </div>
      {goalM != null ? (
        <div className="ml-9 mt-1.5">
          <div className="flex items-center justify-between gap-2 text-[10px]">
            <span className={goalReached ? "font-medium text-emerald-600" : "text-zinc-400"}>
              {goalReached ? t.crew_member_goal_reached : t.crew_member_goal_progress(goalPercent ?? 0)}
            </span>
            <span className="tabular-nums text-zinc-400">
              {formatDistance(monthDistanceM, unit)} / {formatDistance(goalM, unit)}
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100">
            <div
              className={`h-full rounded-full ${goalReached ? "bg-emerald-500" : "bg-zinc-700"}`}
              style={{ width: `${goalPercent}%` }}
            />
          </div>
        </div>
      ) : null}
      {showNudge ? (
        pickerOpen ? (
          <div className="mt-1.5 flex flex-wrap gap-1 pl-9">
            {t.nudge_presets.map((label, i) => (
              <button
                key={i}
                type="button"
                disabled={nudging}
                onClick={() => {
                  setPickerOpen(false);
                  onNudge(i);
                }}
                className="rounded-md border border-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          <button
            type="button"
            disabled={nudging}
            onClick={() => {
              if (nudged) {
                toast.error(t.nudge_already_sent);
                return;
              }
              setPickerOpen(true);
            }}
            className="ml-9 mt-1 rounded-md border border-zinc-200 px-2 py-0.5 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
          >
            👊 {t.nudge_btn}
          </button>
        )
      ) : null}
    </div>
  );
}
