"use client";

import { PageLayout } from "@/app/_components/PageLayout";
import { Alert } from "@/app/_components/ui/Alert";
import { Card } from "@/app/_components/ui/Card";
import { fetchWorkouts, type WorkoutListItem } from "@/lib/api";
import { logout } from "@/lib/auth";
import { formatKm, formatShortDateTime } from "@/lib/format";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { workoutDetailHref } from "@/lib/workoutRoute";
import { formatDuration, formatPaceMinPerKm } from "@/lib/workoutTrack";
import { useEffect, useState } from "react";

export default function MyPage() {
  const { user, loading } = useRequireAuth("/my");
  const [records, setRecords] = useState<WorkoutListItem[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setRecordsLoading(true);
    fetchWorkouts(user)
      .then(setRecords)
      .catch((e) => setError(String(e)))
      .finally(() => setRecordsLoading(false));
  }, [user]);

  if (loading || !user) {
    return (
      <PageLayout title="내정보">
        <Card className="text-sm text-zinc-600">로딩 중...</Card>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="내정보">
      <Card>
        <div className="text-sm text-zinc-500">로그인 계정</div>
        <div className="mt-2 text-lg font-medium">
          {user.displayName ?? "(이름 없음)"}
        </div>
        <div className="mt-1 text-sm text-zinc-600">{user.email ?? ""}</div>
        <button
          type="button"
          onClick={() => logout()}
          className="mt-4 h-11 w-full rounded-xl border border-zinc-200 text-sm text-zinc-700 hover:bg-zinc-50"
        >
          로그아웃
        </button>
      </Card>

      <Card className="mt-6">
        <div className="text-lg font-semibold">운동 기록</div>

        {error ? <Alert className="mt-3">{error}</Alert> : null}

        <div className="mt-3 grid gap-2">
          {recordsLoading ? (
            <div className="text-sm text-zinc-600">불러오는 중...</div>
          ) : records.length === 0 ? (
            <div className="text-sm text-zinc-600">
              아직 저장된 운동 기록이 없습니다.
            </div>
          ) : (
            records.map((r) => (
              <a
                key={r.id}
                href={workoutDetailHref(r.id)}
                className="block rounded-xl border border-zinc-200 px-4 py-3 hover:bg-zinc-50"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium text-zinc-900">
                    {formatShortDateTime(r.startedAt)}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {formatKm(r.distanceM)}
                  </div>
                </div>
                <div className="mt-1 text-sm text-zinc-600">
                  {formatDuration(r.durationSec)} · {r.calories} kcal ·{" "}
                  {formatPaceMinPerKm(r.distanceM, r.durationSec)}
                </div>
              </a>
            ))
          )}
        </div>
      </Card>
    </PageLayout>
  );
}
