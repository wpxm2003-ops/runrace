"use client";

import { PageLayout } from "@/app/_components/PageLayout";
import { useConfirm } from "@/app/_components/ConfirmProvider";
import { Alert } from "@/app/_components/ui/Alert";
import { Card } from "@/app/_components/ui/Card";
import { deleteWorkout, fetchChallengeWorkout, fetchWorkout, useMe, type WorkoutDetail } from "@/lib/api";
import { challengeDetailHref, parseChallengeIdFromQuery } from "@/lib/challengeRoute";
import { WorkoutTimeRange } from "@/app/_components/WorkoutTimeRange";
import { WorkoutMedia } from "@/app/_components/WorkoutMedia";
import { WorkoutStatGrid } from "@/app/_components/WorkoutStatGrid";
import { parseWorkoutId } from "@/lib/workoutRoute";
import { ShareButton } from "@/app/_components/ShareButton";
import { shareLink } from "@/lib/shareCard";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import { nativeNavigate } from "@/lib/nativeNav";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export default function WorkoutDetailContent() {
  const confirm = useConfirm();
  const { t, locale } = useLocale();
  const { unit } = useUnit();
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
          <WorkoutMedia
            isIndoor={isIndoor}
            imageUrl={detail.imageUrl ?? null}
            path={detail.path}
            heightClass="h-64 sm:h-80"
          />

          <div className="mt-4">
            <WorkoutStatGrid
              durationSec={detail.durationSec}
              distanceM={detail.distanceM}
              calories={detail.calories}
              size="lg"
              unit={unit}
              labels={{
                time: t.stat_time,
                distance: t.stat_distance,
                pace: t.stat_pace,
                calories: t.stat_calories,
              }}
            />
          </div>

          <div className="mt-4">
            <WorkoutTimeRange startedAt={detail.startedAt} endedAt={detail.endedAt} t={t} locale={locale} />
          </div>
        </>
      )}
    </PageLayout>
  );
}
