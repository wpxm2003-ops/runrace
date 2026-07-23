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
import { WorkoutMedia } from "@/app/_components/WorkoutMedia";
import { WorkoutStatGrid, workoutStatLabels } from "@/app/_components/WorkoutStatGrid";
import { parseWorkoutIdFromPath } from "@/lib/workoutRoute";
import { ShareButton } from "@/app/_components/ShareButton";
import { WorkoutPhotoButton } from "@/app/_components/WorkoutPhotoButton";
import { ElevationSection } from "./ElevationSection";
import { KmSplitSection } from "./KmSplitSection";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import { nativeNavigate } from "@/lib/nativeNav";
import { toast } from "sonner";
import { useRouteId } from "@/lib/useRouteId";
import { useState } from "react";
import { getAppUrl } from "@/lib/appUrl";

const ACTION_ICON_CLASS =
  "inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 disabled:opacity-50";

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.6 10.7 15.4 6.3M8.6 13.3l6.8 4.4" strokeLinecap="round" />
    </svg>
  );
}

function PhotoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path d="M4 8a2 2 0 0 1 2-2h2l1.5-2h5L16 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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

  const pageActions = detail ? (
    <div className="flex items-center gap-1.5">
      <ShareButton onShare={onShare} className={ACTION_ICON_CLASS} ariaLabel={t.share_btn}>
        <ShareIcon />
      </ShareButton>
      {user && id ? (
        <>
          <WorkoutPhotoButton
            key={id}
            workoutId={id}
            imageUrl={detail.imageUrl ?? null}
            user={user}
            className={ACTION_ICON_CLASS}
            ariaLabel={detail.imageUrl ? t.photo_view_btn : t.photo_save_btn}
          >
            <PhotoIcon />
          </WorkoutPhotoButton>
          <button
            type="button"
            disabled={deleting}
            onClick={onDelete}
            className={`${ACTION_ICON_CLASS} text-red-600`}
            aria-label={t.workout_delete_btn}
            title={t.workout_delete_btn}
          >
            <TrashIcon />
          </button>
        </>
      ) : null}
    </div>
  ) : null;

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
            <>
              <div className="mt-4">
                <ElevationSection path={detail.path} />
              </div>
              <div className="mt-4">
                <KmSplitSection
                  path={detail.path}
                  distanceM={detail.distanceM}
                  workoutType={detail.workoutType}
                  t={t}
                />
              </div>
            </>
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
              <WorkoutMemoEditor workoutId={id!} initialMemo={detail.memo} user={user} />
            </div>
          ) : detail.memo ? (
            <p className="mt-4 whitespace-pre-wrap rounded-xl bg-zinc-50 px-4 py-3 text-sm leading-relaxed text-zinc-700">
              {detail.memo}
            </p>
          ) : null}

        </>
      )}
    </PageLayout>
  );
}
