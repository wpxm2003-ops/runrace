"use client";

import dynamic from "next/dynamic";
import { WorkoutCelebration } from "@/app/workout/_components/WorkoutCelebration";
import { WorkoutStatsGrid } from "@/app/workout/_components/WorkoutStatsGrid";
import { apiFetch } from "@/lib/api";
import { redirectToLogin } from "@/lib/auth";
import { useAuthUser } from "@/lib/useAuthUser";
import { useWorkoutSession } from "@/lib/useWorkoutSession";
import type { WorkoutFinishSnapshot } from "@/lib/workoutTrack";
import { useCallback, useEffect, useState } from "react";

const WorkoutMap = dynamic(() => import("@/app/workout/_components/WorkoutMap"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-zinc-100 text-sm text-zinc-500">
      지도 불러오는 중...
    </div>
  ),
});

type CelebrationState = {
  recordId: number;
  snapshot: WorkoutFinishSnapshot;
};

export default function WorkoutPage() {
  const { user, loading } = useAuthUser();
  const session = useWorkoutSession();
  const [celebration, setCelebration] = useState<CelebrationState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      redirectToLogin("/workout");
    }
  }, [loading, user]);

  const handleStop = useCallback(async () => {
    const snapshot = session.stop();
    if (!snapshot || snapshot.path.length === 0) {
      setSaveError("저장할 운동 경로가 없습니다.");
      return;
    }
    if (!user) return;

    setSaveError(null);
    setSaving(true);

    try {
      const res = await apiFetch<{ id: number }>("/api/workouts", {
        method: "POST",
        user,
        body: {
          startedAt: snapshot.startedAt,
          endedAt: snapshot.endedAt,
          durationSec: snapshot.durationSec,
          distanceM: snapshot.distanceM,
          calories: snapshot.calories,
          avgPaceSecPerKm: snapshot.avgPaceSecPerKm,
          path: snapshot.path,
        },
      });
      setCelebration({ recordId: res.id, snapshot });
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  }, [session, user]);

  if (loading || !user) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-zinc-600">
        로딩 중...
      </div>
    );
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
        <h1 className="text-lg font-semibold sm:text-xl">운동하기</h1>
        <p className="mt-0.5 text-xs text-zinc-500">
          이동 경로가 지도에 실시간으로 표시됩니다.
        </p>
      </div>

      <div className="relative min-h-0 flex-1">
        <WorkoutMap
          path={session.path}
          position={session.position}
          follow={session.status === "running"}
        />
        {session.geoError ? (
          <div className="absolute left-3 right-3 top-3 z-10 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 shadow-sm">
            {session.geoError}
          </div>
        ) : null}
        {!session.position && !session.geoError ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-zinc-100/80 text-sm text-zinc-600">
            위치 확인 중...
          </div>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-zinc-200 bg-zinc-50 px-3 py-3 sm:px-4 sm:py-4">
        <div className="mx-auto max-w-2xl">
          {saveError ? (
            <div className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
              {saveError}
            </div>
          ) : null}
          <WorkoutStatsGrid
            status={session.status}
            elapsedLabel={session.elapsedLabel}
            calories={session.calories}
            paceLabel={session.paceLabel}
            onStart={session.start}
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
