"use client";

import { memo, useState } from "react";
import { Card } from "@/app/_components/ui/Card";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import { formatDistanceAmount } from "@/lib/units";
import type { ChallengeMember } from "@/lib/api/types";

const MEDALS = ["🥇", "🥈", "🥉"] as const;

/** 순위 배지: 1~3위는 메달, 그 외(또는 메달 비표시)는 숫자 원형. */
const RankBadge = memo(function RankBadge({
  rank,
  medal,
}: {
  rank: number;
  medal: boolean;
}) {
  if (medal && rank <= 3) {
    return (
      <span className="shrink-0 text-lg leading-none" aria-hidden>
        {MEDALS[rank - 1]}
      </span>
    );
  }
  return (
    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-500">
      {rank}
    </span>
  );
});

type MemberRowProps = {
  member: ChallengeMember;
  rank: number;
  isMe: boolean;
  showMedal: boolean;
  goalKm: number;
  /** 지정 시 다른 참가자 행에 콕 찌르기 버튼을 표시한다(진행 중·참여자일 때만 부모가 전달). */
  onNudge?: (targetUserId: string, variant: number) => void;
  nudging?: boolean;
  nudged?: boolean;
};

/**
 * 리더보드 한 줄. memo로 감싸 부모(상세 페이지)의 메뉴 토글·투표 등
 * 무관한 상태 변경 시 재렌더되지 않도록 격리한다.
 */
const MemberRow = memo(function MemberRow({
  member: m,
  rank,
  isMe,
  showMedal,
  goalKm,
  onNudge,
  nudging,
  nudged,
}: MemberRowProps) {
  const { t } = useLocale();
  const { unit } = useUnit();
  const [pickerOpen, setPickerOpen] = useState(false);
  const pct = Math.min(100, Math.max(0, Number(m.progressPercent) || 0));
  const pctLabel = Number.isInteger(pct) ? String(pct) : pct.toFixed(1);

  return (
    <div className={`rounded-xl p-3 ${isMe ? "border border-emerald-200 bg-emerald-50" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <RankBadge rank={rank} medal={showMedal} />
          <div className="min-w-0">
            <div
              className={`truncate text-sm font-medium ${
                isMe ? "font-semibold text-emerald-900" : "text-zinc-900"
              }`}
            >
              {m.nickname ?? t.no_name}
            </div>
            {m.finished ? (
              <div className="mt-0.5 text-[11px] font-medium text-emerald-600">
                {t.detail_finished_badge}
              </div>
            ) : null}
          </div>
        </div>
        <div className="shrink-0 text-right tabular-nums">
          <div className={`text-sm font-semibold ${isMe ? "text-emerald-700" : "text-zinc-900"}`}>
            {pctLabel}%
          </div>
          <div className={`mt-0.5 text-[11px] ${isMe ? "text-emerald-700" : "text-zinc-500"}`}>
            {formatDistanceAmount(m.totalKm, unit)} / {formatDistanceAmount(goalKm, unit)} {unit}
          </div>
        </div>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
        <div
          className={`h-full rounded-full transition-all ${isMe ? "bg-emerald-600" : "bg-zinc-900"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {onNudge && !isMe && !m.finished ? (
        <div className="mt-2 flex flex-col items-end gap-1.5">
          {nudged ? (
            <span className="text-xs font-medium text-emerald-600">{t.nudge_sent}</span>
          ) : pickerOpen ? (
            <div className="flex flex-wrap justify-end gap-1.5">
              {t.nudge_presets.map((label, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={nudging}
                  onClick={() => {
                    setPickerOpen(false);
                    onNudge(m.userId, i);
                  }}
                  className="rounded-lg border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <button
              type="button"
              disabled={nudging}
              onClick={() => setPickerOpen(true)}
              className="rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
            >
              👊 {t.nudge_btn}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
});

type ChallengeLeaderboardProps = {
  members: ChallengeMember[];
  goalKm: number;
  hasStarted: boolean;
  hasEnded: boolean;
  /** 내 행 강조용 — 내 백엔드 userId (me.id). */
  myUserId: string | null;
  /** 지정 시 다른 참가자에게 콕 찌르기 버튼 노출(진행 중·참여자일 때만 전달). */
  onNudge?: (targetUserId: string, variant: number) => void;
  nudgingId?: string | null;
  nudgedIds?: Set<string>;
};

export const ChallengeLeaderboard = memo(function ChallengeLeaderboard({
  members,
  goalKm,
  hasStarted,
  hasEnded,
  myUserId,
  onNudge,
  nudgingId,
  nudgedIds,
}: ChallengeLeaderboardProps) {
  const { t } = useLocale();
  const heading = !hasStarted
    ? t.detail_progress_scheduled
    : hasEnded
    ? t.detail_progress_ended
    : t.detail_progress;

  return (
    <Card className="mt-6">
      <div className="text-lg font-semibold">{heading}</div>
      <div className="mt-4 flex flex-col gap-3">
        {members.map((m, idx) => (
          <MemberRow
            key={m.userId}
            member={m}
            rank={idx + 1}
            isMe={myUserId != null && m.userId === myUserId}
            showMedal={m.finished || hasEnded}
            goalKm={goalKm}
            onNudge={onNudge}
            nudging={nudgingId === m.userId}
            nudged={nudgedIds?.has(m.userId)}
          />
        ))}
      </div>
    </Card>
  );
});
