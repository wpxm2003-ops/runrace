"use client";

import { Card } from "@/app/_components/ui/Card";
import { SkeletonLines } from "@/app/_components/ui/Skeleton";
import { useChallengeWorkouts, toDisplayError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useUnit } from "@/lib/UnitContext";
import { formatDistance } from "@/lib/units";
import { useLocale } from "@/lib/i18n";
import { formatDuration } from "@/lib/workoutTrack";
import type { User } from "firebase/auth";

type Props = {
  challengeId: number;
  isMember: boolean;
  user: User | null;
};

export function ChallengeMemberWorkouts({ challengeId, isMember, user }: Props) {
  const { t, locale } = useLocale();
  const { unit } = useUnit();
  // user(Firebase)가 콜드 스타트에 아직 null이어도, 멤버이면 저장 uid/JWT로 즉시 조회한다.
  const { data: workouts = [], isLoading, error } = useChallengeWorkouts(
    challengeId,
    user,
    isMember,
  );

  return (
    <Card className="mt-6">
      <div className="text-base font-semibold">{t.detail_member_workouts_heading}</div>
      {!isMember ? (
        <p className="mt-3 text-sm text-zinc-500">{t.detail_member_workouts_members_only}</p>
      ) : error ? (
        <p className="mt-3 text-sm text-red-600">{toDisplayError(error)}</p>
      ) : isLoading ? (
        <div className="mt-3">
          <SkeletonLines count={3} />
        </div>
      ) : workouts.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">{t.detail_member_workouts_empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-zinc-100">
          {workouts.map((w) => (
            <li
              key={w.workoutId}
              className="grid grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_auto] gap-x-3 gap-y-0.5 py-3.5 first:pt-0 last:pb-0"
            >
              <p className="col-start-1 row-start-1 self-center truncate text-sm font-medium text-zinc-900">
                {w.nickname ?? t.no_name}
              </p>
              <p className="col-start-2 row-start-1 text-right text-xs tabular-nums text-zinc-500">
                {formatDate(w.startedAt, locale)}
              </p>
              <p className="col-start-2 row-start-2 whitespace-nowrap text-right text-xs tabular-nums">
                <span className="text-zinc-500">{formatDuration(w.durationSec)}</span>
                <span className="mx-1.5 text-zinc-300" aria-hidden>
                  ·
                </span>
                <span className="font-semibold text-zinc-900">{formatDistance(w.distanceM, unit)}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
