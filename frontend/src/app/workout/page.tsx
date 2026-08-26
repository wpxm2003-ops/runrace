"use client";

import dynamic from "next/dynamic";
import { WorkoutCelebration } from "@/app/workout/_components/WorkoutCelebration";
import { WorkoutStatsGrid } from "@/app/workout/_components/WorkoutStatsGrid";
import { useConfirm } from "@/app/_components/ConfirmProvider";
import { Alert } from "@/app/_components/ui/Alert";
import { createWorkout, fetchWorkout, logNsmSession, recordWorkoutStart, useTrainingPlan } from "@/lib/api";
import type { NsmSessionLogBody } from "@/lib/api/types";
import {
  clearGhostSelection,
  loadGhostSelection,
  saveGhostSelection,
} from "@/lib/workoutPersistence";
import { weeklyPlan, nsmTodayIndex, type NsmSession, type NsmVolumeBand } from "@/lib/nsm";
import { isGhostLoss, recordGhostLossStreak, shouldShowNsmCta } from "@/lib/nsmCta";
import { NsmSessionGuide } from "@/app/workout/_components/NsmSessionGuide";
import { clearNsmProgress, loadNsmProgress } from "@/lib/nsmSessionProgress";
import { track, distanceBucket } from "@/lib/analytics";
import { withRetry } from "@/lib/retry";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import { formatDistance } from "@/lib/units";
import { useWorkoutSessionContext } from "@/lib/WorkoutSessionProvider";
import type { LiveRivalGapEntry } from "@/lib/useWorkoutSession";
import type { WorkoutFinishSnapshot } from "@/lib/workoutTrack";
import { computeBestSegments } from "@/lib/workoutTrack";
import type { Achievement, PersonalBest } from "@/lib/api/types";
import { achievementViews } from "@/lib/achievements";
import { celebrationTone } from "@/lib/celebration";
import { WorkoutCountdown } from "@/app/workout/_components/WorkoutCountdown";
import { RunLockOverlay } from "@/app/workout/_components/RunLockOverlay";
import { GhostPicker, type GhostSelection } from "@/app/workout/_components/GhostPicker";
import { GhostGapBanner } from "@/app/workout/_components/GhostGapBanner";
import { RivalGapBanner } from "@/app/workout/_components/RivalGapBanner";
import {
  computeGhostRaceResult,
  ensureGhostTimestamps,
  ghostDistanceAtElapsed,
  ghostTotalDurationMs,
  normalizeGhostRaceResult,
  type GhostRaceResult,
} from "@/lib/ghostRace";
import { useWakeLock } from "@/lib/useWakeLock";
import { isIosWeb, nativeNavigate } from "@/lib/nativeNav";
import {
  savePendingWorkoutSave,
  loadPendingWorkoutSave,
  clearPendingWorkoutSaveIfMatches,
  type PendingWorkoutSave,
} from "@/lib/workoutPendingSave";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

type CelebrationState = {
  recordId: number;
  personalBest: PersonalBest | null;
  achievements: Achievement[];
  ghostResult: GhostRaceResult | null;
  ghostLabel: string | null;
  showNsmCta: boolean;
};

/**
 * 종료 시점의 sub-T 세션 + 렙 진행상태 → 수행 기록 페이로드.
 * 진행상태는 clearNsmProgress()로 지워지기 전에만 읽을 수 있고, 플랜은 upsert라 과거 스케줄이
 * 남지 않는다. 즉 이 순간을 놓치면 "실제로 수행했는지"는 영영 복원할 수 없다.
 */
function buildNsmLog(session: NsmSession | null): NsmSessionLogBody | null {
  if (!session?.isSubT) return null;
  const reps = session.reps ?? 0;
  const progress = loadNsmProgress();
  // 날짜 대신 started로만 판정한다 — 자정을 넘긴 런은 진행상태의 날짜 키가 어제라 날짜 비교가 오히려 틀린다.
  const started = progress?.started === true;
  const done = started && progress?.phase === "done";
  return {
    workoutId: null, // 저장 성공 후 실제 id로 채운다
    day: session.day,
    kind: session.kind as "SHORT" | "MEDIUM" | "LONG",
    targetPaceSec: session.targetPaceSec ?? null,
    repsPlanned: session.reps ?? null,
    repsDone: done ? reps : started ? (progress?.repIndex ?? 0) : 0,
    completed: done,
  };
}

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
  // 저장 실패 시 스냅샷을 보관해 "다시 시도"로 재저장한다 — localStorage 사본(workoutPendingSave)과
  // 이중화되고, 마운트 시 소유자(uid) 확인을 거쳐 복원된다.
  const [pendingSave, setPendingSave] = useState<PendingWorkoutSave | null>(null);
  const [locked, setLocked] = useState(false);
  const [showIosNotice, setShowIosNotice] = useState(false);
  const [ghost, setGhost] = useState<GhostSelection | null>(null);
  const [ghostPickerOpen, setGhostPickerOpen] = useState(false);
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

  // 유령 레이스 — 유령은 활동시간 시계(elapsedSec, 일시정지 제외·1초 갱신)를 따라 달린다.
  // 마지막 GPS 포인트의 t를 쓰면 내가 제자리에 서 있는 동안(새 포인트 없음) 유령까지
  // 같이 얼어붙는다 — 레이스답게 내가 멈춰도 유령은 계속 달리고, 일시정지에만 함께 멈춘다.
  const myElapsedMs = session.status === "idle" ? 0 : session.elapsedSec * 1000;
  const ghostTotalMs = useMemo(() => (ghost ? ghostTotalDurationMs(ghost.path) : 0), [ghost]);
  // ghostTotalMs가 0인 퇴화 유령(타임스탬프 합성 실패 등)이 시작부터 "완주" 처리되는 것 방지.
  const ghostFinished = ghost != null && ghostTotalMs > 0 && myElapsedMs >= ghostTotalMs;
  const ghostGapM = useMemo(() => {
    if (!ghost) return null;
    return session.distanceM - ghostDistanceAtElapsed(ghost.path, myElapsedMs);
  }, [ghost, myElapsedMs, session.distanceM]);

  // 유령 선택을 러닝 본체와 별개로 저장 — id만 저장해두고, 값이 바뀔 때마다 동기화.
  // 첫 실행(마운트)은 건너뛴다 — 초기 ghost는 항상 null이라, 여기서 지워버리면 아래
  // 복원 effect가 읽기도 전에 저장된 선택이 사라져 복원 기능이 통째로 죽는다.
  const ghostSyncReadyRef = useRef(false);
  useEffect(() => {
    if (!ghostSyncReadyRef.current) {
      ghostSyncReadyRef.current = true;
      return;
    }
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

  const saveSnapshot = useCallback(
    async (
      ownerUid: string,
      snapshot: WorkoutFinishSnapshot,
      ghostWorkoutId: number | null,
      ghostResult: GhostRaceResult | null,
      ghostLabel: string | null,
      showNsmCta: boolean,
      nsmLog: NsmSessionLogBody | null,
    ) => {
      // 종료 확인창·재시도 중 계정이 바뀌었으면 새 계정 토큰으로 이전 계정의 런을
      // 저장하지 않는다. 호출 시 캡처한 UID와 현재 Firebase 사용자가 모두 같아야 한다.
      if (!user || user.uid !== ownerUid) return;
      const ownerUser = user;
      setSaveError(null);
      setSaving(true);
      try {
        // 1차 방어: 3초 간격 3회 자동 재시도 (서버 재시작·네트워크 깜빡임 흡수)
        const bestSegments = computeBestSegments(snapshot.path);
        const persistedGhostResult = ghostResult ? normalizeGhostRaceResult(ghostResult) : null;
        const res = await withRetry(
          () => {
            // 3초 재시도 대기 중 계정이 바뀌었으면 더는 네트워크 요청을 만들지 않는다.
            if (currentUserUidRef.current !== ownerUid) {
              throw new Error("workout_owner_changed");
            }
            return createWorkout(
              {
                clientWorkoutId: snapshot.clientWorkoutId,
                startedAt: snapshot.startedAt,
                startedAtLocal: snapshot.startedAtLocal,
                endedAt: snapshot.endedAt,
                durationSec: snapshot.durationSec,
                distanceM: snapshot.distanceM,
                calories: snapshot.calories,
                avgPaceSecPerKm: snapshot.avgPaceSecPerKm,
                path: snapshot.path,
                bestSegments,
                ghostWorkoutId,
                ghostResult: persistedGhostResult,
              },
              ownerUser,
            );
          },
          3,
          3000,
        );
        // sub-T 세션 수행 기록 — best-effort. 실패해도 런 저장은 이미 끝났으므로 흐름을 막지 않는다.
        if (nsmLog) {
          void logNsmSession({ ...nsmLog, workoutId: res.id }, ownerUser).catch(() => {});
        }
        const distanceKm = snapshot.distanceM / 1000;
        void track("running_end", {
          distance_km: Math.round(distanceKm * 100) / 100,
          duration_sec: snapshot.durationSec,
          pace: snapshot.avgPaceSecPerKm ?? 0,
          calories: snapshot.calories ?? 0,
        });
        void track("record_saved", { distance_bucket: distanceBucket(distanceKm) });
        if (ghostWorkoutId != null && ghostResult != null) {
          const deltaSec = Math.round(ghostResult.deltaMs / 1000);
          void track("ghost_race_completed", {
            ghost_workout_id: ghostWorkoutId,
            result: deltaSec === 0 ? "tie" : deltaSec < 0 ? "win" : "loss",
            delta_sec: deltaSec,
            overlap_m: Math.round(ghostResult.overlapDistanceM),
          });
        }
        // 방금 저장한 것이 보관 중이던 그 스냅샷일 때만 비운다 — 새 런의 저장 성공이
        // 이전에 실패해 보관해둔 다른 런을 폐기하면 그 기록은 영구 유실된다.
        setPendingSave((prev) => (prev && prev.snapshot === snapshot ? null : prev));
        clearPendingWorkoutSaveIfMatches(snapshot.clientWorkoutId);
        if (currentUserUidRef.current === ownerUid) {
          const personalBest = res.personalBest ?? null;
          const achievements = res.achievements ?? [];
          // 보여줄 카드가 없으면 모달을 건너뛰고 바로 상세로 — 안 그러면 종료된 운동 화면에 갇힌다.
          const { show } = celebrationTone({
            achievementCount: achievementViews(achievements, t, unit).length,
            personalBest,
            ghostResult,
            ghostLabel,
          });
          if (show) {
            setCelebration({
              recordId: res.id,
              personalBest,
              achievements,
              ghostResult,
              ghostLabel,
              showNsmCta,
            });
          } else {
            nativeNavigate(`/workouts/${res.id}`);
          }
        }
      } catch {
        // 2차 방어: 친절 안내 + 스냅샷 보관(데이터 보존) → 재시도 버튼 노출
        if (currentUserUidRef.current === ownerUid) {
          setSaveError(t.workout_save_failed);
          setPendingSave({
            ownerUid,
            snapshot,
            ghostWorkoutId,
            ghostResult,
            ghostLabel,
            showNsmCta,
            nsmLog,
          });
        }
      } finally {
        setSaving(false);
      }
    },
    [user, t, unit],
  );

  const handleStop = useCallback(async () => {
    if (!user) return;
    const ownerUid = user.uid;

    // distanceM은 미터 단위 — 이동 거리가 사실상 없을 때(1m 미만)만 저장 확인
    if (session.distanceM < 1) {
      const ok = await confirm({
        title: t.workout_save_empty_title,
        message: t.workout_save_empty_message,
        confirmLabel: t.save,
        cancelLabel: t.cancel,
      });
      if (currentUserUidRef.current !== ownerUid) return;
      if (!ok) {
        session.stop(ownerUid);
        // 저장하지 않기로 확정 — 일시정지로 남기면 저장되지도 않을 거리가 15분간 보인다.
        session.discardLiveRun(ownerUid);
        setSaveError(null);
        setGhost(null);
        return;
      }
    }

    const snapshot = session.stop(ownerUid);
    if (!snapshot) return;
    // 반드시 clearNsmProgress()보다 먼저 — 지운 뒤에는 몇 렙을 했는지 알 방법이 없다.
    const nsmLog = buildNsmLog(nsmToday);
    clearNsmProgress(); // 런 종료 — NSM 렙 진행 정리
    if (snapshot.path.length === 0) {
      // 경로가 없어 저장이 불가능 — 위와 같은 이유로 라이브 값을 남기지 않는다.
      session.discardLiveRun(ownerUid);
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
    const ghostWorkoutId = ghostResult ? (ghost?.id ?? null) : null;
    setGhost(null); // 유령은 매 런마다 새로 고른다(등록형 라이벌 아님)
    // POST 전에 먼저 로컬에 남겨 둔다 — 도중에 앱이 죽어도 이 스냅샷은 살아남는다.
    savePendingWorkoutSave({
      ownerUid,
      snapshot,
      ghostWorkoutId,
      ghostResult,
      ghostLabel,
      showNsmCta,
      nsmLog,
    });
    await saveSnapshot(
      ownerUid,
      snapshot,
      ghostWorkoutId,
      ghostResult,
      ghostLabel,
      showNsmCta,
      nsmLog,
    );
  }, [
    session,
    user,
    saveSnapshot,
    confirm,
    ghost,
    trainingPlan,
    nsmToday,
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
          personalBest={celebration.personalBest}
          achievements={celebration.achievements}
          ghostResult={celebration.ghostResult}
          ghostLabel={celebration.ghostLabel}
          showNsmCta={celebration.showNsmCta}
        />
      ) : null}

      <GhostPicker
        open={ghostPickerOpen}
        onClose={() => setGhostPickerOpen(false)}
        onSelect={(g) => {
          setGhost(g);
          void track("ghost_race_started");
        }}
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
