"use client";

import { SkeletonLines } from "@/app/_components/ui/Skeleton";
import { useChallengeWorkouts } from "@/lib/api";
import { challengeWorkoutHref } from "@/lib/challengeRoute";
import { formatKm } from "@/lib/format";
import { useLocale } from "@/lib/i18n";
import type { User } from "firebase/auth";

type Props = {
  challengeId: number;
  isMember: boolean;
  user: User | null;
};

export function ChallengeMemberWorkouts({ challengeId, isMember, user }: Props) {
  const { t } = useLocale();
  const { data: workouts = [], isLoading, error } = useChallengeWorkouts(
    challengeId,
    user,
    isMember && user != null,
  );

  return (
    <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="text-lg font-semibold">{t.detail_member_workouts_heading}</div>
      {!isMember || !user ? (
        <p className="mt-3 text-sm text-zinc-500">{t.detail_member_workouts_members_only}</p>
      ) : error ? (
        <p className="mt-3 text-sm text-red-600">{String(error)}</p>
      ) : isLoading ? (
        <div className="mt-3">
          <SkeletonLines count={3} />
        </div>
      ) : workouts.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">{t.detail_member_workouts_empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-zinc-100">
          {workouts.map((w) => (
            <li key={w.workoutId}>
              <a
                href={challengeWorkoutHref(challengeId, w.workoutId)}
                className="flex items-center justify-between gap-3 py-3 hover:bg-zinc-50"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-zinc-900">
                    {w.nickname ?? t.no_name}
                  </div>
                </div>
                <div className="shrink-0 text-right text-xs text-zinc-600">
                  <div className="font-medium tabular-nums">{formatKm(w.distanceM)}</div>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
