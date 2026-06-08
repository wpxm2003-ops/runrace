"use client";

import dynamic from "next/dynamic";
import { PageLayout } from "@/app/_components/PageLayout";
import { useConfirm } from "@/app/_components/ConfirmProvider";
import { Alert } from "@/app/_components/ui/Alert";
import { Card } from "@/app/_components/ui/Card";
import { deleteWorkout, fetchChallengeWorkout, fetchWorkout, useMe, type WorkoutDetail } from "@/lib/api";
import { challengeDetailHref, parseChallengeIdFromQuery } from "@/lib/challengeRoute";
import { formatDate, formatDateTime, formatKm } from "@/lib/format";
import { parseWorkoutId } from "@/lib/workoutRoute";
import { formatDuration, formatPaceMinPerKm } from "@/lib/workoutTrack";
import { ShareButton } from "@/app/_components/ShareButton";
import { shareLink } from "@/lib/shareCard";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useLocale } from "@/lib/i18n";
import { nativeNavigate } from "@/lib/nativeNav";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const WorkoutMap = dynamic(() => import("@/app/workout/_components/WorkoutMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 items-center justify-center rounded-2xl bg-zinc-100 text-sm text-zinc-500">
      Loading map...
    </div>
  ),
});

export default function WorkoutDetailContent() {
  const confirm = useConfirm();
  const { t } = useLocale();
  const [detail, setDetail] = useState<WorkoutDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const params = useParams();
  const searchParams = useSearchParams();
  const id = useMemo(() => parseWorkoutId(String(params?.id ?? "")), [params?.id]);
  const challengeId = useMemo(
    () => parseChallengeIdFromQuery(searchParams.get("challenge")),
    [searchParams],
  );
  const fromChallenge = challengeId != null;
  const returnPath =
    id != null
      ? fromChallenge
        ? `/workouts/${id}?challenge=${challengeId}`
        : `/workouts/${id}`
      : undefined;
  const { user } = useRequireAuth(returnPath);
  // 내 운동일 때만 닉네임 카드에 표시 (레이스 맥락은 타인 기록일 수 있음)
  const { data: me } = useMe(fromChallenge ? null : user);

  async function onShare() {
    if (!id) return;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://runrace.co.kr";
    return shareLink(`${appUrl}/workouts/${id}`, "RunRace");
  }

  useEffect(() => {
    if (!id || !user) return;
    setDetail(null);
    setError(null);
    const load = fromChallenge
      ? fetchChallengeWorkout(challengeId!, id, user)
      : fetchWorkout(id, user);
    load.then(setDetail).catch((e) => setError(String(e)));
  }, [id, user, challengeId, fromChallenge]);

  const isIndoor = detail?.workoutType === "INDOOR";
  const lastPosition = detail?.path[detail.path.length - 1] ?? null;

  async function onDelete() {
    if (!user || !id || fromChallenge) return;
    const ok = await confirm({
      title: t.workout_delete_title,
      message: t.workout_delete_message,
      confirmLabel: t.delete,
      destructive: true,
    });
    if (!ok) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteWorkout(id, user);
      nativeNavigate("/records");
    } catch (e) {
      setError(String(e));
      setDeleting(false);
    }
  }

  const pageActions = (
    <>
      {detail ? <ShareButton onShare={onShare} /> : null}
      {fromChallenge ? (
        <a
          className="text-sm text-zinc-600 hover:underline"
          href={challengeDetailHref(challengeId!)}
        >
          {t.challenge_workout_back}
        </a>
      ) : (
        <button
          type="button"
          disabled={deleting || !detail}
          onClick={onDelete}
          className="text-sm text-red-600 hover:text-red-800 hover:underline disabled:opacity-50"
        >
          {deleting ? t.workout_deleting_btn : t.workout_delete_btn}
        </button>
      )}
    </>
  );

  return (
    <PageLayout title={t.workout_detail_title} actions={pageActions}>
      {error ? <Alert className="mb-4">{error}</Alert> : null}

      {!detail ? (
        <Card className="text-sm text-zinc-600">{t.loading}</Card>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="relative h-64 sm:h-80">
              {isIndoor ? (
                detail.imageUrl ? (
                  <img
                    src={detail.imageUrl}
                    alt="러닝머신 사진"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center bg-zinc-50 text-sm text-zinc-400">
                    🏃 실내러닝
                  </div>
                )
              ) : (
                <WorkoutMap path={detail.path} position={lastPosition} follow={false} />
              )}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="text-xs text-zinc-500">{t.stat_time}</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">
                {formatDuration(detail.durationSec)}
              </div>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="text-xs text-zinc-500">{t.stat_distance}</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">
                {formatKm(detail.distanceM)}
              </div>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="text-xs text-zinc-500">{t.stat_pace}</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">
                {formatPaceMinPerKm(detail.distanceM, detail.durationSec)}
              </div>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="text-xs text-zinc-500">{t.stat_calories}</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">{detail.calories} kcal</div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-white p-4 text-sm text-zinc-600 shadow-sm">
            <div>
              {t.workout_start_label} {formatDateTime(detail.startedAt)}
            </div>
            <div className="mt-1">
              {t.workout_end_label} {formatDateTime(detail.endedAt)}
            </div>
          </div>
        </>
      )}
    </PageLayout>
  );
}
