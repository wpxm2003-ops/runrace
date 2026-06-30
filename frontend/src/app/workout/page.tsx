"use client";

import dynamic from "next/dynamic";
import { WorkoutCelebration } from "@/app/workout/_components/WorkoutCelebration";
import { WorkoutStatsGrid } from "@/app/workout/_components/WorkoutStatsGrid";
import { useConfirm } from "@/app/_components/ConfirmProvider";
import { Alert } from "@/app/_components/ui/Alert";
import { createWorkout, useTrainingPlan } from "@/lib/api";
import { weeklyPlan } from "@/lib/nsm";
import { NsmSessionGuide } from "@/app/workout/_components/NsmSessionGuide";
import { clearNsmProgress } from "@/lib/nsmSessionProgress";
import { track } from "@/lib/analytics";
import { withRetry } from "@/lib/retry";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useLocale } from "@/lib/i18n";
import { useWorkoutSessionContext } from "@/lib/WorkoutSessionProvider";
import type { WorkoutFinishSnapshot } from "@/lib/workoutTrack";
import { computeBestSegments } from "@/lib/workoutTrack";
import type { PersonalBest } from "@/lib/api/types";
import { WorkoutCountdown } from "@/app/workout/_components/WorkoutCountdown";
import { RunLockOverlay } from "@/app/workout/_components/RunLockOverlay";
import { useWakeLock } from "@/lib/useWakeLock";
import { isIosWeb } from "@/lib/nativeNav";
import { useCallback, useEffect, useState } from "react";

const WorkoutMap = dynamic(() => import("@/app/workout/_components/WorkoutMap"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-zinc-100 text-sm text-zinc-500">
      Loading map...
    </div>
  ),
});

type CelebrationState = { recordId: number; snapshot: WorkoutFinishSnapshot; personalBest: PersonalBest | null };

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
  const [locked, setLocked] = useState(false);
  const [showIosNotice, setShowIosNotice] = useState(false);

  const active = session.status !== "idle";

  // NSM 자동 인식 — 활성 플랜이 있고 오늘이 sub-T 날이면, 일반 "운동하기"로도 세션 가이드를 띄운다.
  const { data: trainingPlan } = useTrainingPlan(user);
  const nsmTodayIdx = (new Date().getDay() + 6) % 7;
  const nsmToday = trainingPlan
    ? weeklyPlan(trainingPlan.thresholdPaceSec, trainingPlan.subTDays)[nsmTodayIdx]
    : null;
  const isNsmDay = !!nsmToday?.isSubT;

  // 러닝 중 화면이 꺼지지 않게 유지(포그라운드 GPS 유지). 미지원 브라우저는 무시.
  useWakeLock(session.status === "running");

  // 런이 끝나면 잠금 자동 해제.
  useEffect(() => {
    if (!active && locked) setLocked(false);
  }, [active, locked]);

  // iOS 웹/PWA는 백그라운드 GPS 한계가 있어 1회 안내.
  useEffect(() => {
    if (isIosWeb() && !localStorage.getItem("ios_run_notice_seen")) {
      setShowIosNotice(true);
    }
  }, []);

  const dismissIosNotice = useCallback(() => {
    localStorage.setItem("ios_run_notice_seen", "1");
    setShowIosNotice(false);
  }, []);

  const saveSnapshot = useCallback(
    async (snapshot: WorkoutFinishSnapshot) => {
      if (!user) return;
      setSaveError(null);
      setSaving(true);
      try {
        // 1차 방어: 3초 간격 3회 자동 재시도 (서버 재시작·네트워크 깜빡임 흡수)
        const bestSegments = computeBestSegments(snapshot.path);
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
                bestSegments,
              },
              user,
            ),
          3,
          3000,
        );
        const distanceKm = snapshot.distanceM / 1000;
        void track("running_end", {
          distance_km: Math.round(distanceKm * 100) / 100,
          duration_sec: snapshot.durationSec,
          pace: snapshot.avgPaceSecPerKm ?? 0,
          calories: snapshot.calories ?? 0,
        });
        void track("record_saved", {
          distance_bucket: distanceKm < 1 ? "under_1km" : distanceKm < 3 ? "1_3km" : distanceKm < 5 ? "3_5km" : "over_5km",
        });
        setPendingSnapshot(null);
        setCelebration({ recordId: res.id, snapshot, personalBest: res.personalBest ?? null });
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
    clearNsmProgress(); // 런 종료 — NSM 렙 진행 정리
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
      {locked && active ? (
        <RunLockOverlay
          elapsedLabel={session.elapsedLabel}
          distanceM={session.distanceM}
          paceLabel={session.paceLabel}
          onUnlock={() => setLocked(false)}
        />
      ) : null}

      {celebration ? (
        <WorkoutCelebration
          recordId={celebration.recordId}
          durationSec={celebration.snapshot.durationSec}
          distanceM={celebration.snapshot.distanceM}
          personalBest={celebration.personalBest}
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
              clearNsmProgress(); // 새 런 시작 — 이전 NSM 렙 진행 초기화
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
          {showIosNotice ? (
            <div className="mb-3 flex items-start justify-between gap-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <span>{t.ios_run_notice}</span>
              <button
                type="button"
                onClick={dismissIosNotice}
                className="shrink-0 font-medium text-amber-700 underline"
              >
                {t.confirm}
              </button>
            </div>
          ) : null}
          {active ? (
            <button
              type="button"
              onClick={() => setLocked(true)}
              className="mb-3 h-11 w-full rounded-xl border border-zinc-300 bg-white text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              🔒 {t.run_lock_button}
            </button>
          ) : null}
          {isNsmDay && active ? (
            <NsmSessionGuide
              session={nsmToday!}
              distanceM={session.distanceM}
              elapsedSec={session.elapsedSec}
            />
          ) : null}
          {isNsmDay && !active ? (
            <div className="mb-3 rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-700">
              🏃 오늘은 <span className="font-semibold">NSM 세션</span>이에요. 시작하면 렙별 페이스 가이드가 떠요.
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
