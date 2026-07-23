"use client";

import dynamic from "next/dynamic";
import { WorkoutCelebration } from "@/app/workout/_components/WorkoutCelebration";
import { WorkoutStatsGrid } from "@/app/workout/_components/WorkoutStatsGrid";
import { useConfirm } from "@/app/_components/ConfirmProvider";
import { Alert } from "@/app/_components/ui/Alert";
import { createWorkout, fetchWorkout, useTrainingPlan } from "@/lib/api";
import {
  clearGhostSelection,
  loadGhostSelection,
  saveGhostSelection,
} from "@/lib/workoutPersistence";
import { weeklyPlan, nsmTodayIndex, type NsmSession, type NsmVolumeBand } from "@/lib/nsm";
import { isGhostLoss, recordGhostLossStreak, shouldShowNsmCta } from "@/lib/nsmCta";
import { NsmSessionGuide } from "@/app/workout/_components/NsmSessionGuide";
import { clearNsmProgress } from "@/lib/nsmSessionProgress";
import { track, distanceBucket } from "@/lib/analytics";
import { withRetry } from "@/lib/retry";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import { formatDistance } from "@/lib/units";
import { useWorkoutSessionContext } from "@/lib/WorkoutSessionProvider";
import type { WorkoutFinishSnapshot } from "@/lib/workoutTrack";
import { computeBestSegments } from "@/lib/workoutTrack";
import type { PersonalBest } from "@/lib/api/types";
import { WorkoutCountdown } from "@/app/workout/_components/WorkoutCountdown";
import { RunLockOverlay } from "@/app/workout/_components/RunLockOverlay";
import { GhostPicker, type GhostSelection } from "@/app/workout/_components/GhostPicker";
import { GhostGapBanner } from "@/app/workout/_components/GhostGapBanner";
import {
  computeGhostRaceResult,
  ensureGhostTimestamps,
  ghostDistanceAtElapsed,
  ghostTotalDurationMs,
  type GhostRaceResult,
} from "@/lib/ghostRace";
import { useWakeLock } from "@/lib/useWakeLock";
import { isIosWeb } from "@/lib/nativeNav";
import { useCallback, useEffect, useMemo, useState } from "react";

const WorkoutMap = dynamic(() => import("@/app/workout/_components/WorkoutMap"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-zinc-100 text-sm text-zinc-500">
      Loading map...
    </div>
  ),
});

type CelebrationState = {
  recordId: number;
  snapshot: WorkoutFinishSnapshot;
  personalBest: PersonalBest | null;
  ghostResult: GhostRaceResult | null;
  ghostLabel: string | null;
  showNsmCta: boolean;
};

type PendingSave = {
  snapshot: WorkoutFinishSnapshot;
  ghostResult: GhostRaceResult | null;
  ghostLabel: string | null;
  showNsmCta: boolean;
};

export default function WorkoutPage() {
  const { user, loading } = useRequireAuth("/workout");
  const { t } = useLocale();
  const { unit } = useUnit();
  const session = useWorkoutSessionContext();
  const confirm = useConfirm();
  const [celebration, setCelebration] = useState<CelebrationState | null>(null);
  const [counting, setCounting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // 저장 실패 시 스냅샷을 보관해 "다시 시도"로 재저장한다(stop이 localStorage를 비우므로 메모리에 보존).
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);
  const [locked, setLocked] = useState(false);
  const [showIosNotice, setShowIosNotice] = useState(false);
  const [ghost, setGhost] = useState<GhostSelection | null>(null);
  const [ghostPickerOpen, setGhostPickerOpen] = useState(false);

  const active = session.status !== "idle";

  // 유령 레이스 — 유령은 활동시간 시계(elapsedSec, 일시정지 제외·1초 갱신)를 따라 달린다.
  // 마지막 GPS 포인트의 t를 쓰면 내가 제자리에 서 있는 동안(새 포인트 없음) 유령까지
  // 같이 얼어붙는다 — 레이스답게 내가 멈춰도 유령은 계속 달리고, 일시정지에만 함께 멈춘다.
  const myElapsedMs = session.status === "idle" ? 0 : session.elapsedSec * 1000;
  const ghostTotalMs = useMemo(() => (ghost ? ghostTotalDurationMs(ghost.path) : 0), [ghost]);
  const ghostFinished = ghost != null && myElapsedMs >= ghostTotalMs;
  const ghostGapM = useMemo(() => {
    if (!ghost) return null;
    return session.distanceM - ghostDistanceAtElapsed(ghost.path, myElapsedMs);
  }, [ghost, myElapsedMs, session.distanceM]);

  // 유령 선택을 러닝 본체와 별개로 저장 — id만 저장해두고, 값이 바뀔 때마다 동기화.
  useEffect(() => {
    if (ghost) saveGhostSelection(ghost.id);
    else clearGhostSelection();
  }, [ghost]);

  // 마운트 시 복원 — 백그라운드 전환으로 WebView가 재구성돼도(런은 세션 훅이 별도 복원) 고른 유령을 되찾는다.
  useEffect(() => {
    if (!user) return;
    const savedId = loadGhostSelection();
    if (savedId == null) return;
    fetchWorkout(savedId, user)
      .then((detail) => {
        setGhost({
          id: detail.id,
          label: formatDistance(detail.distanceM, unit),
          distanceM: detail.distanceM,
          // 피커와 동일하게 구형 기록(t 없음)도 t를 합성해 복원한다.
          path: ensureGhostTimestamps(detail.path, detail.durationSec),
        });
      })
      .catch(() => clearGhostSelection());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // NSM 자동 인식 — 활성 플랜이 있고 오늘이 sub-T 날이면, 일반 "운동하기"로도 세션 가이드를 띄운다.
  const { data: trainingPlan } = useTrainingPlan(user);
  const liveNsmToday = trainingPlan
    ? weeklyPlan(
        trainingPlan.thresholdPaceSec,
        trainingPlan.subTDays,
        (trainingPlan.weeklyBand ?? undefined) as NsmVolumeBand | undefined,
      )[nsmTodayIndex()]
    : null;
  // 러닝 중엔 오늘의 세션을 런 시작 시점 값으로 고정 — 자정을 넘어 nsmTodayIndex가 바뀌어도
  // 가이드가 세션 종류를 바꾸거나 언마운트돼 진행이 끊기지 않게 한다.
  const [frozenNsmToday, setFrozenNsmToday] = useState<NsmSession | null>(null);
  useEffect(() => {
    if (active) setFrozenNsmToday((prev) => prev ?? liveNsmToday);
    else setFrozenNsmToday(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  const nsmToday = active ? frozenNsmToday ?? liveNsmToday : liveNsmToday;
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
    async (
      snapshot: WorkoutFinishSnapshot,
      ghostResult: GhostRaceResult | null,
      ghostLabel: string | null,
      showNsmCta: boolean,
    ) => {
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
        void track("record_saved", { distance_bucket: distanceBucket(distanceKm) });
        setPendingSave(null);
        setCelebration({
          recordId: res.id,
          snapshot,
          personalBest: res.personalBest ?? null,
          ghostResult,
          ghostLabel,
          showNsmCta,
        });
      } catch {
        // 2차 방어: 친절 안내 + 스냅샷 보관(데이터 보존) → 재시도 버튼 노출
        setSaveError(t.workout_save_failed);
        setPendingSave({ snapshot, ghostResult, ghostLabel, showNsmCta });
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
        setGhost(null);
        return;
      }
    }

    const snapshot = session.stop();
    clearNsmProgress(); // 런 종료 — NSM 렙 진행 정리
    if (!snapshot || snapshot.path.length === 0) {
      setSaveError(t.workout_no_route);
      setGhost(null);
      return;
    }
    const ghostResult = ghost ? computeGhostRaceResult(snapshot.path, ghost.path) : null;
    const ghostLabel = ghost?.label ?? null;
    // 연패 장부 갱신(승·무는 리셋) + NSM CTA 판정 — 게이트 규칙(접전·연패·7일 캡)은 nsmCta.ts가 소유.
    // trainingPlan이 undefined(미로딩·조회 실패)면 플랜 보유로 간주 — 플랜 있는 유저에게 잘못 노출하는 쪽보다 안 보여주는 쪽으로 실패.
    const lossStreak =
      ghost && ghostResult ? recordGhostLossStreak(ghost.id, isGhostLoss(ghostResult)) : 0;
    const showNsmCta =
      ghostResult != null &&
      shouldShowNsmCta({ hasPlan: trainingPlan !== null, result: ghostResult, lossStreak });
    setGhost(null); // 유령은 매 런마다 새로 고른다(등록형 라이벌 아님)
    await saveSnapshot(snapshot, ghostResult, ghostLabel, showNsmCta);
  }, [
    session,
    user,
    saveSnapshot,
    confirm,
    ghost,
    trainingPlan,
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
          ghostResult={celebration.ghostResult}
          ghostLabel={celebration.ghostLabel}
          showNsmCta={celebration.showNsmCta}
          saving={saving}
          onConfirm={() => {}}
        />
      ) : null}

      <GhostPicker
        open={ghostPickerOpen}
        onClose={() => setGhostPickerOpen(false)}
        onSelect={setGhost}
        user={user}
      />

      <div className="shrink-0 border-b border-zinc-200 bg-white px-4 py-2.5 sm:px-6 sm:py-3">
        <h1 className="text-lg font-semibold sm:text-xl">{t.workout_title}</h1>
        <p className="mt-0.5 text-xs text-zinc-500">{t.workout_subtitle}</p>
      </div>

      <div className="relative min-h-0 flex-1">
        <WorkoutMap
          path={session.path}
          position={session.position}
          follow={session.status === "running"}
          ghostPath={ghost?.path}
          ghostElapsedMs={myElapsedMs}
        />
        {counting ? (
          <WorkoutCountdown
            onComplete={() => {
              setCounting(false);
              clearNsmProgress(); // 새 런 시작 — 이전 NSM 렙 진행 초기화
              session.start();
            }}
          />
        ) : null}
        <div className="absolute left-3 right-3 top-3 z-10 flex flex-col gap-2">
          {(() => {
            const base = "rounded-xl px-3 py-2 text-sm shadow-sm";
            const tier = session.vehicleTier;
            const cls: Record<string, string> = {
              weak_gps: "bg-violet-50 text-violet-900",
              confirmed: "bg-red-50 text-red-800",
              suspect: "bg-amber-50 text-amber-800",
              recovering: "bg-blue-50 text-blue-800",
            };
            const msg: Record<string, string> = {
              weak_gps: t.workout_weak_gps,
              confirmed: t.workout_vehicle_confirmed,
              suspect: t.workout_vehicle_suspect,
              recovering: t.workout_vehicle_recovering,
            };
            if (tier && cls[tier]) {
              return <div className={`${base} ${cls[tier]}`}>{msg[tier]}</div>;
            }
            if (session.geoError) {
              return <div className={`${base} bg-red-50 text-red-700`}>{session.geoError}</div>;
            }
            return null;
          })()}
          {ghost && active && ghostGapM != null ? (
            <GhostGapBanner gapM={ghostGapM} ghostFinished={ghostFinished} unit={unit} />
          ) : null}
        </div>
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
              {t.nsm_workout_banner}
            </div>
          ) : null}
          {!active ? (
            ghost ? (
              <div className="mb-3 flex items-center justify-between rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5 text-sm">
                <span className="font-medium text-violet-800">
                  👻 {t.ghost_chip_selected(ghost.label)}
                </span>
                <div className="flex shrink-0 gap-3">
                  <button
                    type="button"
                    onClick={() => setGhostPickerOpen(true)}
                    className="text-xs font-medium text-violet-700 underline"
                  >
                    {t.ghost_change}
                  </button>
                  <button
                    type="button"
                    onClick={() => setGhost(null)}
                    className="text-xs font-medium text-violet-700 underline"
                  >
                    {t.ghost_clear}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setGhostPickerOpen(true)}
                className="mb-3 flex w-full items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                👻 {t.ghost_chip_label}
              </button>
            )
          ) : null}
          {saveError ? <Alert className="mb-3">{saveError}</Alert> : null}
          {pendingSave ? (
            <button
              type="button"
              onClick={() =>
                saveSnapshot(
                  pendingSave.snapshot,
                  pendingSave.ghostResult,
                  pendingSave.ghostLabel,
                  pendingSave.showNsmCta,
                )
              }
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
