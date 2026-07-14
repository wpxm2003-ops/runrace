"use client";

import {
  challengePhaseBadgeClass,
  resolveChallengePhase,
  type ChallengePhase,
} from "@/lib/challengePhase";
import { useLocale } from "@/lib/i18n";

type Props = {
  startAt: string;
  endAt: string | null;
  apiPhase?: string | null;
  /** apiPhase 없을 때 날짜로만 계산한 phase를 직접 넘길 때 */
  phase?: ChallengePhase;
  /** 목록 카드에서 사용하는 작은 사각형 배지. */
  compact?: boolean;
};

function phaseLabel(
  phase: ChallengePhase,
  labels: {
    scheduled: string;
    in_progress: string;
    ended: string;
  },
): string {
  switch (phase) {
    case "scheduled":
      return labels.scheduled;
    case "in_progress":
      return labels.in_progress;
    case "ended":
      return labels.ended;
  }
}

export function ChallengePhaseBadge({ startAt, endAt, apiPhase, phase, compact = false }: Props) {
  const { t } = useLocale();
  const resolved =
    phase ?? resolveChallengePhase(startAt, endAt, apiPhase);
  return (
    <span
      className={
        compact
          ? `shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
              resolved === "scheduled"
                ? "bg-amber-100 text-amber-700"
                : resolved === "in_progress"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-zinc-100 text-zinc-500"
            }`
          : challengePhaseBadgeClass(resolved)
      }
    >
      {phaseLabel(resolved, {
        scheduled: t.races_filter_scheduled,
        in_progress: t.races_filter_in_progress,
        ended: t.races_filter_ended,
      })}
    </span>
  );
}
