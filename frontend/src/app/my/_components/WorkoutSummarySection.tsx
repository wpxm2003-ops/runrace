"use client";

import type { User } from "firebase/auth";
import { Alert } from "@/app/_components/ui/Alert";
import { AsyncList } from "@/app/_components/ui/AsyncList";
import { Card } from "@/app/_components/ui/Card";
import { WorkoutAggregateStats } from "@/app/_components/WorkoutAggregateStats";
import { useWorkoutSummary } from "@/lib/api";
import { useLocale } from "@/lib/i18n";

/** 전체 운동 기록 요약 — 누적 거리·횟수·연속일수. */
export function WorkoutSummarySection({ user }: { user: User }) {
  const { t } = useLocale();
  const { data: summary, isLoading: summaryLoading, error: summaryError } = useWorkoutSummary(user);

  return (
    <Card className="mt-4">
      <div className="text-base font-semibold">{t.my_records_all_time}</div>
      {summaryError ? <Alert className="mt-3">{String(summaryError)}</Alert> : null}
      <div className="mt-3">
        <AsyncList
          isLoading={summaryLoading}
          data={summary}
          isEmpty={(d) => d.workoutCount === 0}
          emptyMessage={t.my_records_empty}
          skeletonCount={3}
        >
          {(summary) => (
            <WorkoutAggregateStats
              stats={summary}
              showWorkoutDays
              totalLabels
              maxStreakDays={summary.maxStreakDays}
            />
          )}
        </AsyncList>
      </div>
    </Card>
  );
}
