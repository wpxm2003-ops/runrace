"use client";

import { memo, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/app/_components/ui/Card";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import { formatDistanceAmount } from "@/lib/units";
import { formatDuration } from "@/lib/workoutTrack";
import type { ChallengeMember } from "@/lib/api/types";

/** userId → 현재 사용자 기준 누적 전적. */
export type HeadToHeadMap = Map<string, { wins: number; losses: number }>;

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
  /** 지정 시(종료된 레이스의 라이벌 행) 나와의 누적 전적을 표시한다. */
  record?: { wins: number; losses: number };
  /** 지정 시 다른 참가자 행에 콕 찌르기 버튼을 표시한다(진행 중·참여자일 때만 부모가 전달). */
  onNudge?: (targetUserId: string, variant: number) => void;
  nudging?: boolean;
  nudged?: boolean;
};

/**
 * 리더보드 한 줄. memo로 감싸 부모(상세 페이지)의 메뉴 토글·투표 등
 * 무관한 상태 변경 시 재렌더되지 않도록 격리한다.
 * 강조 색: 내 행=초록, 라이벌 행=주황(라벨로 이유 안내).
 */
const MemberRow = memo(function MemberRow({
  member: m,
  rank,
  isMe,
  showMedal,
  goalKm,
  record,
  onNudge,
  nudging,
  nudged,
}: MemberRowProps) {
  const { t } = useLocale();
  const { unit } = useUnit();
  const [pickerOpen, setPickerOpen] = useState(false);
  const pct = Math.min(100, Math.max(0, Number(m.progressPercent) || 0));
  const pctLabel = Number.isInteger(pct) ? String(pct) : pct.toFixed(1);
  const isRival = m.isRival && !isMe;

  const rowAccent = isMe
    ? "border border-emerald-200 bg-emerald-50"
    : isRival
      ? "border border-amber-200 bg-amber-50"
      : "";
  const nameColor = isMe
    ? "font-semibold text-emerald-900"
    : isRival
      ? "font-semibold text-amber-900"
      : "text-zinc-900";

  return (
    <div className={`rounded-xl p-3 ${rowAccent}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <RankBadge rank={rank} medal={showMedal} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className={`truncate text-sm font-medium ${nameColor}`}>
                {m.nickname ?? t.no_name}
              </span>
              {isMe ? (
                <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                  {t.me_label}
                </span>
              ) : isRival ? (
                <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                  {t.rival_label}
                </span>
              ) : null}
            </div>
            {m.finished ? (
              <div className="mt-0.5 text-[11px] font-medium text-emerald-600">
                {t.detail_finished_badge}
              </div>
            ) : null}
            {record ? (
              <div className="mt-0.5 text-[11px] font-medium text-amber-700">
                {record.wins === 0 && record.losses === 0
                  ? t.head_to_head_first
                  : t.head_to_head_record(record.wins, record.losses)}
              </div>
            ) : null}
            {onNudge && !isMe && !m.finished ? (
              pickerOpen ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {t.nudge_presets.map((label, i) => (
                    <button
                      key={i}
                      type="button"
                      disabled={nudging}
                      onClick={() => {
                        setPickerOpen(false);
                        onNudge(m.userId, i);
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
                    if (nudged) { toast.error(t.nudge_already_sent); return; }
                    setPickerOpen(true);
                  }}
                  className="mt-1 rounded-md border border-zinc-200 px-2 py-0.5 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                >
                  👊 {t.nudge_btn}
                </button>
              )
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
  /** 종료된 레이스 — userId별 나와의 누적 전적(라이벌 참여자만). 미전달 시 전적 미표시. */
  headToHead?: HeadToHeadMap;
  /** 지정 시 다른 참가자에게 콕 찌르기 버튼 노출(진행 중·참여자일 때만 전달). */
  onNudge?: (targetUserId: string, variant: number) => void;
  nudgingId?: string | null;
  nudgedIds?: Set<string>;
};

/**
 * 종료된 레이스의 "승부욕 자극" 한 줄 — 내 최종 순위 + 바로 위 상대를 추격하는 프레이밍.
 * 패배("졌어요") 대신 "…까지 N초!"로 표현해 다시 뛰고 싶게 만든다.
 */
const ResultSummary = memo(function ResultSummary({
  members,
  myUserId,
  unit,
}: {
  members: ChallengeMember[];
  myUserId: string;
  unit: ReturnType<typeof useUnit>["unit"];
}) {
  const { t } = useLocale();
  const idx = members.findIndex((m) => m.userId === myUserId);
  if (idx < 0) return null;
  const me = members[idx];
  const rank = me.finalRank ?? idx + 1;

  let text: string;
  if (rank === 1) {
    text = t.result_winner();
  } else {
    const above = members[idx - 1];
    if (!above) return null;
    const aboveName = above.nickname ?? t.no_name;
    let gap: string;
    if (me.finishedAt && above.finishedAt) {
      const sec = Math.abs(
        Math.round(
          (new Date(me.finishedAt).getTime() - new Date(above.finishedAt).getTime()) / 1000,
        ),
      );
      gap = formatDuration(sec);
    } else {
      const diffKm = Math.max(0, Number(above.totalKm) - Number(me.totalKm));
      gap = `${formatDistanceAmount(diffKm, unit)} ${unit}`;
    }
    text = t.result_chase(aboveName, gap);
  }

  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-900">
      {text}
    </div>
  );
});

export const ChallengeLeaderboard = memo(function ChallengeLeaderboard({
  members,
  goalKm,
  hasStarted,
  hasEnded,
  myUserId,
  headToHead,
  onNudge,
  nudgingId,
  nudgedIds,
}: ChallengeLeaderboardProps) {
  const { t } = useLocale();
  const { unit } = useUnit();
  const heading = !hasStarted
    ? t.detail_progress_scheduled
    : hasEnded
    ? t.detail_progress_ended
    : t.detail_progress;

  return (
    <Card className="mt-6">
      <div className="text-base font-semibold">{heading}</div>
      <div className="mt-4">
        {hasEnded && myUserId ? (
          <ResultSummary members={members} myUserId={myUserId} unit={unit} />
        ) : null}
        <div className="flex flex-col gap-3">
          {members.map((m, idx) => (
            <MemberRow
              key={m.userId}
              member={m}
              rank={m.finalRank ?? idx + 1}
              isMe={myUserId != null && m.userId === myUserId}
              showMedal={m.finished || hasEnded}
              goalKm={goalKm}
              record={hasEnded && m.isRival ? headToHead?.get(m.userId) : undefined}
              onNudge={onNudge}
              nudging={nudgingId === m.userId}
              nudged={nudgedIds?.has(m.userId)}
            />
          ))}
        </div>
      </div>
    </Card>
  );
});
