"use client";

import dynamic from "next/dynamic";
import { WorkoutCelebration } from "@/app/workout/_components/WorkoutCelebration";
import { WorkoutStatsGrid } from "@/app/workout/_components/WorkoutStatsGrid";
import { Alert } from "@/app/_components/ui/Alert";
import { recordWorkoutStart } from "@/lib/api";
import { NsmSessionGuide } from "@/app/workout/_components/NsmSessionGuide";
import { clearNsmProgress } from "@/lib/nsmSessionProgress";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import { useWorkoutSessionContext } from "@/lib/WorkoutSessionProvider";
import type { LiveRivalGapEntry } from "@/lib/useWorkoutSession";
import { WorkoutCountdown } from "@/app/workout/_components/WorkoutCountdown";
import { RunLockOverlay } from "@/app/workout/_components/RunLockOverlay";
import { GhostPicker } from "@/app/workout/_components/GhostPicker";
import { GhostGapBanner } from "@/app/workout/_components/GhostGapBanner";
import { RivalGapBanner } from "@/app/workout/_components/RivalGapBanner";
import { useWakeLock } from "@/lib/useWakeLock";
import { isIosWeb } from "@/lib/nativeNav";
import {
  loadPendingWorkoutSave,
  type PendingWorkoutSave,
} from "@/lib/workoutPendingSave";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkoutSave, type CelebrationState } from "./useWorkoutSave";
import { useWorkoutGhostRace } from "./useWorkoutGhostRace";
import { useWorkoutNsmGuide } from "./useWorkoutNsmGuide";
import { useWorkoutStop } from "./useWorkoutStop";

/** 러닝 화면에 동시에 띄우는 라이벌 격차 배너 상한 — 지도가 배너로 덮이지 않게. */
const MAX_RIVAL_GAP_BANNERS = 3;

const WorkoutMap = dynamic(() => import("@/app/workout/_components/WorkoutMap"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-zinc-100 text-sm text-zinc-500">
      Loading map...
    </div>
  ),
});


/**
 * 종료 시점의 sub-T 세션 + 렙 진행상태 → 수행 기록 페이로드.
 * 진행상태는 clearNsmProgress()로 지워지기 전에만 읽을 수 있고, 플랜은 upsert라 과거 스케줄이
 * 남지 않는다. 즉 이 순간을 놓치면 "실제로 수행했는지"는 영영 복원할 수 없다.
 */
export default function WorkoutPageContent() {
  const { user, loading } = useRequireAuth("/workout");
  const { t } = useLocale();
  const { unit } = useUnit();
  const session = useWorkoutSessionContext();
  const [celebration, setCelebration] = useState<CelebrationState | null>(null);
  const [counting, setCounting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // 저장 실패 시 스냅샷을 보관해 "다시 시도"로 재저장한다 — localStorage 사본(workoutPendingSave)과
  // 이중화되고, 마운트 시 소유자(uid) 확인을 거쳐 복원된다.
  const [pendingSave, setPendingSave] = useState<PendingWorkoutSave | null>(null);
  const [locked, setLocked] = useState(false);
  const [showIosNotice, setShowIosNotice] = useState(false);
  const currentUserUidRef = useRef(user?.uid ?? null);
  currentUserUidRef.current = user?.uid ?? null;

  const active = session.status !== "idle";

  /**
   * 라이벌 격차 배너 — 라이벌 1명당 한 줄만 남긴다.
   *
   * 서버는 (레이스 × 라이벌)마다 격차를 주는데, 격차는 레이스별 누적 거리를 포함하므로 같은
   * 사람이 레이스마다 다른 값으로 나온다. 그대로 렌더하면 "○○보다 8.5km 앞" 바로 밑에
   * "○○보다 7.5km 뒤"가 붙어 서로 모순돼 보이고(배너에 레이스 이름도 없다), 부호가 엇갈리면
   * 진동도 두 번 울린다.
   *
   * 어느 레이스를 남길지는 challengeId로 고정한다. "가장 접전인 레이스"로 고르면 핑마다
   * 선택이 바뀔 수 있는데, 배너 key가 userId라 재마운트되지 않아 추월 감지가 이전 레이스의
   * 부호와 비교된다 — 실제로는 순위가 그대로인데 "추월했다" 문구와 진동이 발동한다.
   */
  const liveRivalGaps = session.liveRivalGaps;
  const visibleRivalGaps = useMemo(() => {
    const perRival = new Map<string, LiveRivalGapEntry>();
    for (const gap of liveRivalGaps) {
      const prev = perRival.get(gap.userId);
      if (!prev || gap.challengeId < prev.challengeId) perRival.set(gap.userId, gap);
    }
    return [...perRival.values()]
      .sort((a, b) => a.challengeId - b.challengeId || a.userId.localeCompare(b.userId))
      .slice(0, MAX_RIVAL_GAP_BANNERS);
  }, [liveRivalGaps]);

  const ghostRace = useWorkoutGhostRace(user ?? null, unit, session);
  const { ghost, elapsedMs: myElapsedMs, finished: ghostFinished, gapM: ghostGapM } = ghostRace;
  const { trainingPlan, today: nsmToday, isNsmDay } = useWorkoutNsmGuide(user ?? null, active);

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

  // 마운트 시 복원 — POST 도중 앱이 죽거나 탭을 옮겨도 종료된 런이 유실되지 않게 한다.
  // uid로 소유자를 확인해, 같은 기기에서 계정을 전환했을 때 다른 사용자의 실패한 런이
  // 새 로그인 계정으로 잘못 복원·저장되지 않게 막는다.
  useEffect(() => {
    if (!user) {
      setPendingSave(null);
      return;
    }
    setPendingSave(loadPendingWorkoutSave(user.uid));
  }, [user]);

  const saveSnapshot = useWorkoutSave({
    user, t, unit, currentUserUidRef, setSaveError, setSaving,
    setPendingSave, setCelebration,
  });
  const handleStop = useWorkoutStop({
    user: user ?? null,
    session,
    t,
    ghost,
    clearGhost: ghostRace.clear,
    trainingPlan,
    nsmToday,
    saveSnapshot,
    currentUserUidRef,
    setSaveError,
  });

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
          personalBest={celebration.personalBest}
          achievements={celebration.achievements}
          ghostResult={celebration.ghostResult}
          ghostLabel={celebration.ghostLabel}
          showNsmCta={celebration.showNsmCta}
        />
      ) : null}

      <GhostPicker
        open={ghostRace.pickerOpen}
        onClose={ghostRace.closePicker}
        onSelect={ghostRace.select}
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
            onGo={() => {
              clearNsmProgress(); // 새 런 시작 — 이전 NSM 렙 진행 초기화
              // 실제로 시작된 경우에만 기록한다 — GPS 차단·인증 미확정으로 start가 조기
              // 반환해도 이력만 남으면 운영 화면의 "운동 시작" 건수가 실제와 어긋난다.
              if (session.start(user.uid)) {
                void recordWorkoutStart(user).catch(() => undefined);
              }
            }}
            onComplete={() => setCounting(false)}
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
            // GPS 오류가 최우선 — 콜백이 끊긴 상태에선 나머지 배너가 전부 낡은 정보다.
            if (session.geoError) {
              return <div className={`${base} bg-red-50 text-red-700`}>{session.geoError}</div>;
            }
            // 방치 자동 일시정지가 tier보다 우선 — 이미 일시정지된 상태라 GPS 감시도
            // 꺼져 있고, tier 배너는 멈추기 직전의 낡은 판정이다.
            if (session.autoPaused) {
              return (
                <div className={`${base} bg-emerald-50 text-emerald-800`}>
                  {t.workout_auto_paused}
                </div>
              );
            }
            if (tier && cls[tier]) {
              return <div className={`${base} ${cls[tier]}`}>{msg[tier]}</div>;
            }
            return null;
          })()}
          {ghost && active && ghostGapM != null ? (
            <GhostGapBanner gapM={ghostGapM} ghostFinished={ghostFinished} unit={unit} />
          ) : null}
          {active
            ? visibleRivalGaps.map((g) => (
                <RivalGapBanner
                  key={`${g.challengeId}-${g.userId}`}
                  nickname={g.nickname ?? t.no_name}
                  gapM={g.gapM}
                  unit={unit}
                />
              ))
            : null}
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
                    onClick={ghostRace.openPicker}
                    className="text-xs font-medium text-violet-700 underline"
                  >
                    {t.ghost_change}
                  </button>
                  <button
                    type="button"
                    onClick={ghostRace.clear}
                    className="text-xs font-medium text-violet-700 underline"
                  >
                    {t.ghost_clear}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={ghostRace.openPicker}
                className="mb-3 flex w-full items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                <span className="min-w-0 flex-1 text-left">👻 {t.ghost_chip_label}</span>
                <span className="text-lg leading-none text-zinc-300" aria-hidden="true">›</span>
              </button>
            )
          ) : null}
          {/* 저장 실패 안내·재시도는 새 런이 진행 중이 아닐 때만 — 러닝 중 재시도를 누르면
              saving이 현재 런의 종료 버튼을 잠그고, 성공 축하 모달이 런 위로 덮인다. */}
          {!active && saveError ? <Alert className="mb-3">{saveError}</Alert> : null}
          {!active && pendingSave ? (
            <button
              type="button"
              onClick={() =>
                saveSnapshot(
                  pendingSave.ownerUid,
                  pendingSave.snapshot,
                  pendingSave.ghostWorkoutId,
                  pendingSave.ghostResult,
                  pendingSave.ghostLabel,
                  pendingSave.showNsmCta,
                  pendingSave.nsmLog,
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
            onPause={() => session.pause(user.uid)}
            onResume={() => session.resume(user.uid)}
            onStop={handleStop}
            stopDisabled={saving}
          />
        </div>
      </div>
    </div>
  );
}
