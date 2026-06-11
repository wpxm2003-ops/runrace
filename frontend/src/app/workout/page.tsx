"use client";

import dynamic from "next/dynamic";
import { WorkoutCelebration } from "@/app/workout/_components/WorkoutCelebration";
import { WorkoutStatsGrid } from "@/app/workout/_components/WorkoutStatsGrid";
import { useConfirm } from "@/app/_components/ConfirmProvider";
import { Alert } from "@/app/_components/ui/Alert";
import { createWorkout } from "@/lib/api";
import { track } from "@/lib/analytics";
import { withRetry } from "@/lib/retry";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useLocale } from "@/lib/i18n";
import { useWorkoutSessionContext } from "@/lib/WorkoutSessionProvider";
import type { WorkoutFinishSnapshot } from "@/lib/workoutTrack";
import { WorkoutCountdown } from "@/app/workout/_components/WorkoutCountdown";
import { useCallback, useState } from "react";

const WorkoutMap = dynamic(() => import("@/app/workout/_components/WorkoutMap"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-zinc-100 text-sm text-zinc-500">
      Loading map...
    </div>
  ),
});

type CelebrationState = { recordId: number; snapshot: WorkoutFinishSnapshot };

export default function WorkoutPage() {
  const { user, loading } = useRequireAuth("/workout");
  const { t } = useLocale();
  const session = useWorkoutSessionContext();
  const confirm = useConfirm();
  const [celebration, setCelebration] = useState<CelebrationState | null>(null);
  const [counting, setCounting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // 저장 실패 시 스냅샷을 보관해 "다시 시도"로 재저장한다(stop이 localStorage를 비우므로 메모리에 보존).
  const [pendingSnapshot, setPendingSnapshot] = useState<WorkoutFinishSnapshot | null>(null);

  const saveSnapshot = useCallback(
    async (snapshot: WorkoutFinishSnapshot) => {
      if (!user) return;
      setSaveError(null);
      setSaving(true);
      try {
        // 1차 방어: 3초 간격 3회 자동 재시도 (서버 재시작·네트워크 깜빡임 흡수)
        const res = await withRetry(
          () =>
            createWorkout(
              {
                startedAt: snapshot.startedAt,
                endedAt: snapshot.endedAt,
                durationSec: snapshot.durationSec,
                distanceM: snapshot.distanceM,
                calories: snapshot.calories,
                avgPaceSecPerKm: snapshot.avgPaceSecPerKm,
                path: snapshot.path,
              },
              user,
            ),
          3,
          3000,
        );
        void track("workout_recorded", {
          type: "gps",
          distanceM: snapshot.distanceM,
          durationSec: snapshot.durationSec,
        });
        setPendingSnapshot(null);
        setCelebration({ recordId: res.id, snapshot });
      } catch {
        // 2차 방어: 친절 안내 + 스냅샷 보관(데이터 보존) → 재시도 버튼 노출
        setSaveError(t.workout_save_failed);
        setPendingSnapshot(snapshot);
      } finally {
        setSaving(false);
      }
    },
    [user, t.workout_save_failed],
  );

  const handleStop = useCallback(async () => {
    if (!user) return;

    // distanceM은 미터 단위 — 이동 거리가 사실상 없을 때(1m 미만)만 저장 확인
    if (session.distanceM < 1) {
      const ok = await confirm({
        title: t.workout_save_empty_title,
        message: t.workout_save_empty_message,
        confirmLabel: t.save,
        cancelLabel: t.cancel,
      });
      if (!ok) {
        session.stop();
        setSaveError(null);
        return;
      }
    }

    const snapshot = session.stop();
    if (!snapshot || snapshot.path.length === 0) {
      setSaveError(t.workout_no_route);
      return;
    }
    await saveSnapshot(snapshot);
  }, [
    session,
    user,
    saveSnapshot,
    confirm,
    t.workout_no_route,
    t.workout_save_empty_title,
    t.workout_save_empty_message,
    t.save,
    t.cancel,
  ]);

  if (loading || !user) {
    return <div className="flex flex-1 items-center justify-center text-sm text-zinc-600">{t.loading}</div>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {celebration ? (
        <WorkoutCelebration
          recordId={celebration.recordId}
          durationSec={celebration.snapshot.durationSec}
          distanceM={celebration.snapshot.distanceM}
          calories={celebration.snapshot.calories}
          saving={saving}
          onConfirm={() => {}}
        />
      ) : null}

      <div className="shrink-0 border-b border-zinc-200 bg-white px-4 py-2.5 sm:px-6 sm:py-3">
        <h1 className="text-lg font-semibold sm:text-xl">{t.workout_title}</h1>
        <p className="mt-0.5 text-xs text-zinc-500">{t.workout_subtitle}</p>
      </div>

      <div className="relative min-h-0 flex-1">
        <WorkoutMap path={session.path} position={session.position} follow={session.status === "running"} />
        {counting ? (
          <WorkoutCountdown
            onComplete={() => {
              setCounting(false);
              session.start();
            }}
          />
        ) : null}
        {session.vehicleTier === "weak_gps" ? (
          <div className="absolute left-3 right-3 top-3 z-10 rounded-xl bg-violet-50 px-3 py-2 text-sm text-violet-900 shadow-sm">
            {t.workout_weak_gps}
          </div>
        ) : session.vehicleTier === "confirmed" ? (
          <div className="absolute left-3 right-3 top-3 z-10 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 shadow-sm">
            {t.workout_vehicle_confirmed}
          </div>
        ) : session.vehicleTier === "suspect" ? (
          <div className="absolute left-3 right-3 top-3 z-10 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 shadow-sm">
            {t.workout_vehicle_suspect}
          </div>
        ) : session.vehicleTier === "recovering" ? (
          <div className="absolute left-3 right-3 top-3 z-10 rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-800 shadow-sm">
            {t.workout_vehicle_recovering}
          </div>
        ) : session.geoError ? (
          <div className="absolute left-3 right-3 top-3 z-10 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 shadow-sm">
            {session.geoError}
          </div>
        ) : null}
        {!session.position && !session.geoError ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-zinc-100/80 text-sm text-zinc-600">
            {t.workout_locating}
          </div>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-zinc-200 bg-zinc-50 px-3 py-3 sm:px-4 sm:py-4">
        <div className="mx-auto max-w-2xl">
          {session.isRestored ? (
            <div className="mb-3 rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-800">
              {t.workout_restored}
            </div>
          ) : null}
          {saveError ? <Alert className="mb-3">{saveError}</Alert> : null}
          {pendingSnapshot ? (
            <button
              type="button"
              onClick={() => saveSnapshot(pendingSnapshot)}
              disabled={saving}
              className="mb-3 h-11 w-full rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? t.saving : t.retry}
            </button>
          ) : null}
          <WorkoutStatsGrid
            status={session.status}
            elapsedLabel={session.elapsedLabel}
            distanceM={session.distanceM}
            paceLabel={session.paceLabel}
            onStart={() => setCounting(true)}
            onPause={session.pause}
            onResume={session.resume}
            onStop={handleStop}
            stopDisabled={saving}
          />
        </div>
      </div>
    </div>
  );
}
