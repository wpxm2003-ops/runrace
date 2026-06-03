"use client";

import { PageLayout } from "@/app/_components/PageLayout";
import { apiFetch } from "@/lib/api";
import { logout, redirectToLogin } from "@/lib/auth";
import { useAuthUser } from "@/lib/useAuthUser";
import { workoutDetailHref } from "@/lib/workoutRoute";
import { formatDuration, formatPaceMinPerKm } from "@/lib/workoutTrack";
import { useEffect, useState } from "react";

type WorkoutListItem = {
  id: number;
  startedAt: string;
  endedAt: string;
  durationSec: number;
  distanceM: number;
  calories: number;
  avgPaceSecPerKm: number | null;
};

function formatWorkoutDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MyPage() {
  const { user, loading } = useAuthUser();
  const [records, setRecords] = useState<WorkoutListItem[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      redirectToLogin("/my");
      return;
    }
    if (!user) return;

    setRecordsLoading(true);
    apiFetch<WorkoutListItem[]>("/api/workouts/list", { user })
      .then(setRecords)
      .catch((e) => setError(String(e)))
      .finally(() => setRecordsLoading(false));
  }, [loading, user]);

  if (loading || !user) {
    return (
      <PageLayout title="내정보">
        <div className="rounded-2xl bg-white p-5 text-sm text-zinc-600 shadow-sm">
          로딩 중...
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="내정보">
      <div className="rounded-2xl bg-white p-5 shadow-sm">
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
      </div>

      <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
        <div className="text-lg font-semibold">운동 기록</div>

        {error ? (
          <div className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

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
                    {formatWorkoutDate(r.startedAt)}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {(r.distanceM / 1000).toFixed(2)} km
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
      </div>
    </PageLayout>
  );
}
