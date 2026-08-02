"use client";

import { Card } from "@/app/_components/ui/Card";
import { SkeletonLines } from "@/app/_components/ui/Skeleton";
import { useChallengeWorkouts, toDisplayError } from "@/lib/api";
import { formatDateTimeMinute } from "@/lib/format";
import { useUnit } from "@/lib/UnitContext";
import { formatDistance } from "@/lib/units";
import { useLocale } from "@/lib/i18n";
import { formatClock } from "@/lib/workoutTrack";
import type { User } from "firebase/auth";

type Props = {
  challengeId: number;
  user: User | null;
};

export function ChallengeMemberWorkouts({ challengeId, user }: Props) {
  const { t, locale } = useLocale();
  const { unit } = useUnit();
  // 참여자 운동 목록은 전체 공개 — 비참여자·비로그인도 조회한다.
  const { data: workouts = [], isLoading, error } = useChallengeWorkouts(
    challengeId,
    user,
  );

  return (
    <Card className="mt-6">
      <div className="text-base font-semibold">{t.detail_member_workouts_heading}</div>
      {error ? (
        <p className="mt-3 text-sm text-red-600">{toDisplayError(error)}</p>
      ) : isLoading ? (
        <div className="mt-3">
          <SkeletonLines count={3} />
        </div>
      ) : workouts.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">{t.detail_member_workouts_empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-zinc-100">
          {/* 같은 유저·같은 시작시각 기록이 공존할 수 있어(동일 EXIF 실내런 2건) index로 유일성을 보장한다.
              조회 전용·서버 정렬 고정 목록이라 index key가 무해하다. */}
          {workouts.map((w, i) => (
            <li
              key={`${w.userId}-${w.startedAt}-${i}`}
              className="grid grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_auto] gap-x-3 gap-y-0.5 py-3.5 first:pt-0 last:pb-0"
            >
              <p className="col-start-1 row-start-1 self-center truncate text-sm font-medium text-zinc-900">
                {w.nickname ?? t.no_name}
              </p>
              {/* 닉네임 아래 빈 칸(1열 2행)에 실내런 표시 — GPS 기록은 표시가 없다. */}
              {w.workoutType === "INDOOR" ? (
                <p className="col-start-1 row-start-2 truncate text-xs text-zinc-400">
                  - {t.indoor_badge}
                </p>
              ) : null}
              <p className="col-start-2 row-start-1 text-right text-xs tabular-nums text-zinc-500">
                {formatDateTimeMinute(w.startedAt, locale)}
              </p>
              <p className="col-start-2 row-start-2 whitespace-nowrap text-right text-xs tabular-nums">
                <span className="text-zinc-500">{formatClock(w.durationSec)}</span>
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
