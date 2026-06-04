import {
  challengePhaseBadgeClass,
  challengePhaseLabelFor,
  resolveChallengePhase,
  type ChallengePhase,
} from "@/lib/challengePhase";

type Props = {
  startAt: string;
  endAt: string | null;
  apiPhase?: string | null;
  /** apiPhase 없을 때 날짜로만 계산한 phase를 직접 넘길 때 */
  phase?: ChallengePhase;
};

export function ChallengePhaseBadge({ startAt, endAt, apiPhase, phase }: Props) {
  const resolved =
    phase ?? resolveChallengePhase(startAt, endAt, apiPhase);
  return (
    <span className={challengePhaseBadgeClass(resolved)}>
      {challengePhaseLabelFor(resolved)}
    </span>
  );
}
