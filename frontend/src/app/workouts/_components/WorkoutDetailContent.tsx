"use client";

import dynamic from "next/dynamic";
import { PageLayout } from "@/app/_components/PageLayout";
import { useConfirm } from "@/app/_components/ConfirmProvider";
import { Alert } from "@/app/_components/ui/Alert";
import { Card } from "@/app/_components/ui/Card";
import { deleteWorkout, fetchWorkout, type WorkoutDetail } from "@/lib/api";
import { formatDateTime, formatKm } from "@/lib/format";
import { parseWorkoutId } from "@/lib/workoutRoute";
import { formatDuration, formatPaceMinPerKm } from "@/lib/workoutTrack";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const WorkoutMap = dynamic(() => import("@/app/workout/_components/WorkoutMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 items-center justify-center rounded-2xl bg-zinc-100 text-sm text-zinc-500">
      지도 불러오는 중...
    </div>
  ),
});

export default function WorkoutDetailContent() {
  const confirm = useConfirm();
  const [detail, setDetail] = useState<WorkoutDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const params = useParams();
  const id = useMemo(
    () => parseWorkoutId(String(params?.id ?? "")),
    [params?.id],
  );
  const { user } = useRequireAuth(id ? `/workouts/${id}` : undefined);

  useEffect(() => {
    if (!id || !user) return;
    fetchWorkout(id, user)
      .then(setDetail)
      .catch((e) => setError(String(e)));
  }, [id, user]);

  const lastPosition = detail?.path[detail.path.length - 1] ?? null;

  async function onDelete() {
    if (!user || !id) return;
    const ok = await confirm({
      title: "기록 삭제",
      message: "이 운동 기록을 삭제할까요? 삭제 후에는 복구할 수 없습니다.",
      confirmLabel: "삭제",
      destructive: true,
    });
    if (!ok) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteWorkout(id, user);
      window.location.href = "/my";
    } catch (e) {
      setError(String(e));
      setDeleting(false);
    }
  }

  return (
    <PageLayout
      title="운동 기록"
      actions={
        <button
          type="button"
          disabled={deleting || !detail}
          onClick={onDelete}
          className="text-sm text-red-600 hover:text-red-800 hover:underline disabled:opacity-50"
        >
          {deleting ? "삭제 중..." : "삭제하기"}
        </button>
      }
    >
      {error ? <Alert className="mb-4">{error}</Alert> : null}

      {!detail ? (
        <Card className="text-sm text-zinc-600">로딩 중...</Card>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="relative h-64 sm:h-80">
              <WorkoutMap
                path={detail.path}
                position={lastPosition}
                follow={false}
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="text-xs text-zinc-500">시간</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">
                {formatDuration(detail.durationSec)}
              </div>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="text-xs text-zinc-500">거리</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">
                {formatKm(detail.distanceM)}
              </div>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="text-xs text-zinc-500">페이스</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">
                {formatPaceMinPerKm(detail.distanceM, detail.durationSec)}
              </div>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="text-xs text-zinc-500">칼로리</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">
                {detail.calories} kcal
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-white p-4 text-sm text-zinc-600 shadow-sm">
            <div>시작: {formatDateTime(detail.startedAt)}</div>
            <div className="mt-1">종료: {formatDateTime(detail.endedAt)}</div>
          </div>
        </>
      )}
    </PageLayout>
  );
}
