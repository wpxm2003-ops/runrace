"use client";

import { PageLayout } from "@/app/_components/PageLayout";
import { useConfirm } from "@/app/_components/ConfirmProvider";
import { Alert } from "@/app/_components/ui/Alert";
import { LoadingCard } from "@/app/_components/ui/LoadingCard";
import {
  deleteWorkout,
  firstErrorMessage,
  fetchErrorMessage,
  useWorkoutDetail,
  invalidateWorkoutDetail,
  invalidateWorkoutLists,
} from "@/lib/api";
import { WorkoutTimeRange } from "@/app/_components/WorkoutTimeRange";
import { WorkoutComparisonCard } from "@/app/_components/WorkoutComparisonCard";
import { WorkoutMemoEditor } from "@/app/_components/WorkoutMemoEditor";
import { Button } from "@/app/_components/ui/Button";
import { WorkoutMedia } from "@/app/_components/WorkoutMedia";
import { WorkoutStatGrid, workoutStatLabels } from "@/app/_components/WorkoutStatGrid";
import { parseWorkoutIdFromPath } from "@/lib/workoutRoute";
import { ShareButton } from "@/app/_components/ShareButton";
import { KmSplitSection } from "./KmSplitSection";
import { WorkoutShoeSelector } from "./WorkoutShoeSelector";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import { nativeNavigate } from "@/lib/nativeNav";
import { toast } from "sonner";
import { useRouteId } from "@/lib/useRouteId";
import { useState } from "react";
import { getAppUrl } from "@/lib/appUrl";

export default function WorkoutDetailContent() {
  const confirm = useConfirm();
  const { t, locale } = useLocale();
  const { unit } = useUnit();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const id = useRouteId(parseWorkoutIdFromPath);
  const returnPath = id != null ? `/workouts/${id}` : undefined;
  const { user } = useRequireAuth(returnPath);

  const { data: detail, error: fetchError, isLoading } = useWorkoutDetail(id, user ?? null);

  const isIndoor = detail?.workoutType === "INDOOR";

  async function onShare() {
    if (!id) return;
    const { shareLink } = await import("@/lib/shareCard");
    return shareLink(`${getAppUrl()}/workouts/${id}/share`, "RunRace");
  }

  async function onDelete() {
    if (!user || !id) return;
    const ok = await confirm({
      title: t.workout_delete_title,
      message: t.workout_delete_message,
      confirmLabel: t.delete,
      destructive: true,
    });
    if (!ok) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteWorkout(id, user);
      toast.success(t.toast_workout_deleted);
      nativeNavigate("/records", { replace: true });
      invalidateWorkoutDetail(id, user.uid);
      invalidateWorkoutLists(user.uid);
    } catch (e) {
      setDeleteError(String(e));
      setDeleting(false);
    }
  }

  const pageActions = detail ? <ShareButton onShare={onShare} /> : null;

  const error = firstErrorMessage(deleteError, fetchErrorMessage(fetchError, t.workout_not_found));

  return (
    <PageLayout title={t.workout_detail_title} actions={pageActions}>
      {error ? <Alert className="mb-4">{error}</Alert> : null}

      {isLoading || !detail ? (
        <LoadingCard />
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
              labels={workoutStatLabels(t)}
            />
          </div>

          <div className="mt-4">
            <WorkoutTimeRange startedAt={detail.startedAt} endedAt={detail.endedAt} t={t} locale={locale} />
          </div>

          {detail.path.length > 0 ? (
            <div className="mt-4">
              <KmSplitSection
                path={detail.path}
                distanceM={detail.distanceM}
                workoutType={detail.workoutType}
                t={t}
              />
            </div>
          ) : null}

          {user ? (
            <div className="mt-4">
              <WorkoutComparisonCard
                workoutId={id!}
                currentPaceSec={detail.avgPaceSecPerKm ?? null}
                currentDistanceM={detail.distanceM}
                currentDurationSec={detail.durationSec}
                user={user}
              />
            </div>
          ) : null}

          {user ? (
            <div className="mt-4">
              <WorkoutShoeSelector
                workoutId={id!}
                initialShoeId={detail.shoeId ?? null}
                user={user}
              />
            </div>
          ) : null}

          {user ? (
            <div className="mt-4">
              <WorkoutMemoEditor workoutId={id!} initialMemo={detail.memo} user={user} />
            </div>
          ) : detail.memo ? (
            <p className="mt-4 whitespace-pre-wrap rounded-xl bg-zinc-50 px-4 py-3 text-sm leading-relaxed text-zinc-700">
              {detail.memo}
            </p>
          ) : null}

          {user ? (
            <div className="mt-4">
              <Button
                variant="destructive"
                disabled={deleting || !detail}
                onClick={onDelete}
                className="h-11 w-full"
              >
                {deleting ? t.workout_deleting_btn : t.workout_delete_btn}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </PageLayout>
  );
}
