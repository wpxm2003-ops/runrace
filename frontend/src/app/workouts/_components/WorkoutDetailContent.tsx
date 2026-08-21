"use client";

import type { User } from "firebase/auth";
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
import { WorkoutMedia } from "@/app/_components/WorkoutMedia";
import { WorkoutStatGrid, workoutStatLabels } from "@/app/_components/WorkoutStatGrid";
import { parseWorkoutIdFromPath } from "@/lib/workoutRoute";
import { ShareButton } from "@/app/_components/ShareButton";
import { WorkoutPhotoButton } from "@/app/_components/WorkoutPhotoButton";
import { WorkoutMemoButton } from "@/app/_components/WorkoutMemoButton";
import { KmSplitSection } from "./KmSplitSection";
import type { WorkoutDetail } from "@/lib/api/types";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import { nativeNavigate } from "@/lib/nativeNav";
import { toast } from "sonner";
import { useRouteId } from "@/lib/useRouteId";
import { useState } from "react";
import { getAppUrl } from "@/lib/appUrl";
import { ACTION_ICON_CLASS, ShareIcon } from "@/app/_components/ShareIcon";

function PhotoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[18px] w-[18px]">
      <rect x="3" y="5" width="18" height="15" rx="3" />
      <circle cx="12" cy="12.5" r="3.25" />
      <path d="M8.5 5 10 3.5h4L15.5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[18px] w-[18px]">
      <path d="M5 7h14M9 7V4.5h6V7M7 7l.75 13h8.5L17 7M10 11v5M14 11v5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MemoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[18px] w-[18px]">
      <path d="m14.5 5.5 4 4M4 20l1.1-4.6L15.7 4.8a2 2 0 0 1 2.8 0l.7.7a2 2 0 0 1 0 2.8L8.6 18.9 4 20Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m13.3 7.2 3.5 3.5" strokeLinecap="round" />
    </svg>
  );
}

function WorkoutActions({
  user,
  workoutId,
  detail,
  deleting,
  onShare,
  onDelete,
}: {
  user: User | null | undefined;
  workoutId: number | null;
  detail: WorkoutDetail;
  deleting: boolean;
  onShare: () => Promise<"shared" | "copied" | void> | Promise<void>;
  onDelete: () => void;
}) {
  const { t } = useLocale();

  return (
    <div className="flex items-center gap-0.5 rounded-[14px] border border-line bg-panel p-1 shadow-card">
      <ShareButton onShare={onShare} className={ACTION_ICON_CLASS} ariaLabel={t.share_btn}>
        <ShareIcon />
      </ShareButton>
      {user && workoutId ? (
        <>
          <WorkoutPhotoButton
            key={workoutId}
            workoutId={workoutId}
            imageUrl={detail.imageUrl ?? null}
            user={user}
            statsData={{
              distanceM: detail.distanceM,
              durationSec: detail.durationSec,
              workoutType: detail.workoutType,
              path: detail.path,
            }}
            className={ACTION_ICON_CLASS}
            ariaLabel={detail.imageUrl ? t.photo_view_btn : t.photo_save_btn}
            iconOnly
          >
            <PhotoIcon />
          </WorkoutPhotoButton>
          <WorkoutMemoButton
            key={`memo-${workoutId}`}
            workoutId={workoutId}
            initialMemo={detail.memo}
            user={user}
            className={ACTION_ICON_CLASS}
            ariaLabel={t.memo_btn}
            iconOnly
          >
            <MemoIcon />
          </WorkoutMemoButton>
          <button
            type="button"
            disabled={deleting}
            onClick={onDelete}
            className={`${ACTION_ICON_CLASS} ml-0.5 border-l border-l-line text-red-500 hover:bg-red-50 hover:text-red-600`}
            aria-label={t.workout_delete_btn}
            title={t.workout_delete_btn}
          >
            <TrashIcon />
          </button>
        </>
      ) : null}
    </div>
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
      cancelLabel: t.cancel,
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
    <WorkoutActions
      user={user}
      workoutId={id}
      detail={detail}
      deleting={deleting}
      onShare={onShare}
      onDelete={onDelete}
    />
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
            <WorkoutTimeRange startedAt={detail.startedAt} startedAtLocal={detail.startedAtLocal} endedAt={detail.endedAt} t={t} locale={locale} />
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

        </>
      )}
    </PageLayout>
  );
}
