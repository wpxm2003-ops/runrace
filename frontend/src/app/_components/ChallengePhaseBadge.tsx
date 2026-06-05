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

export function ChallengePhaseBadge({ startAt, endAt, apiPhase, phase }: Props) {
  const { t } = useLocale();
  const resolved =
    phase ?? resolveChallengePhase(startAt, endAt, apiPhase);
  return (
    <span className={challengePhaseBadgeClass(resolved)}>
      {phaseLabel(resolved, {
        scheduled: t.races_filter_scheduled,
        in_progress: t.races_filter_in_progress,
        ended: t.races_filter_ended,
      })}
    </span>
  );
}
