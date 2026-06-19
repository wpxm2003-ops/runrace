"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { PageLayout } from "@/app/_components/PageLayout";
import { Alert } from "@/app/_components/ui/Alert";
import { Card } from "@/app/_components/ui/Card";
import { LoadingCard } from "@/app/_components/ui/LoadingCard";
import { SkeletonLines } from "@/app/_components/ui/Skeleton";
import { UnitToggle } from "@/app/_components/ui/UnitToggle";
import { NicknameEditor } from "@/app/my/_components/NicknameEditor";
import {
  useWorkoutSummary,
  useMe,
  useMyChallengeListInfinite,
  toDisplayError,
} from "@/lib/api";
import { deleteAccount } from "@/lib/api/auth";
import { logout } from "@/lib/auth";
import { useConfirm } from "@/app/_components/ConfirmProvider";
import { nativeNavigate } from "@/lib/nativeNav";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import { ChallengeInfiniteList } from "@/app/_components/ChallengeInfiniteList";
import {
  RacePhaseFilter,
  type RacePhaseFilterValue,
} from "@/app/_components/RacePhaseFilter";
import { WorkoutAggregateStats } from "@/app/_components/WorkoutAggregateStats";
import { savePageState, loadPageState, usePageScrollRestore } from "@/lib/pageStateStore";

const STORE_KEY = "page:my";
/** 뒤로가기 시 복원할 최대 페이지 수. 너무 많으면 API 부하가 증가한다. */
const MAX_RESTORE_SIZE = 5;

/** 내가 참여한 레이스 — 예정·진행중 / 종료 2탭 + 무한스크롤. */
function MyRacesSection({ user }: { user: User }) {
  const { t } = useLocale();

  // ── 탭 상태: 이전 방문 값 복원 ──────────────────────────────────────
  const [phase, setPhase] = useState<RacePhaseFilterValue>(() => {
    const saved = loadPageState(STORE_KEY).phase;
    return (saved === "active" || saved === "ended") ? saved : "active";
  });

  const result = useMyChallengeListInfinite(user, phase);
  const { size, setSize, error, data: pages } = result;
  const itemCount = pages ? pages.flatMap((p) => p.items).length : 0;

  usePageScrollRestore(STORE_KEY, itemCount);

  // ── 페이지 수 복원: 마운트 시 1회 ────────────────────────────────────
  const sizeRestored = useRef(false);
  useEffect(() => {
    if (sizeRestored.current) return;
    sizeRestored.current = true;
    const saved = Math.min(loadPageState(STORE_KEY).size ?? 1, MAX_RESTORE_SIZE);
    if (saved > 1) void setSize(saved);
  }, [setSize]);

  // ── 상태 변경 시 저장 ────────────────────────────────────────────────
  useEffect(() => {
    savePageState(STORE_KEY, { phase, size });
  }, [phase, size]);

  function handlePhaseChange(newPhase: RacePhaseFilterValue) {
    setPhase(newPhase);
    void setSize(1);
    // 탭 전환은 새로운 컨텍스트이므로 size를 1로 리셋해서 저장
    savePageState(STORE_KEY, { phase: newPhase, size: 1 });
  }

  const labels: Record<RacePhaseFilterValue, string> = {
    active: t.races_filter_active,
    ended: t.races_filter_ended,
  };

  return (
    <Card className="mt-4">
      <div className="flex flex-col gap-3">
        <div className="text-base font-semibold">{t.my_races_heading}</div>
        <RacePhaseFilter
          value={phase}
          onChange={handlePhaseChange}
          labels={labels}
          ariaLabel={t.races_filter_label}
        />
      </div>
      {error ? <Alert className="mt-3">{toDisplayError(error)}</Alert> : null}
      <ChallengeInfiniteList
        result={result}
        emptyLabel={t.my_races_empty}
        skeletonCount={2}
      />
    </Card>
  );
}

/** 인증 확정 후에만 마운트 → SWR 훅이 로딩 단계에서 중복 기동되지 않음 */
function MyPageContent({ user }: { user: User }) {
  const { t } = useLocale();
  const { unit, setUnit } = useUnit();
  const { data: me, isLoading: meLoading } = useMe(user);
  const {
    data: summary,
    isLoading: summaryLoading,
    error: summaryError,
  } = useWorkoutSummary(user);

  const confirm = useConfirm();

  return (
    <PageLayout title={t.my_title}>
      <Card>
        <div className="text-sm text-zinc-500">{t.my_account_label}</div>
        <div className="mt-1 text-sm text-zinc-600">{user.email ?? ""}</div>

        <NicknameEditor user={user} nickname={me?.nickname} loading={meLoading} />
      </Card>

      <Card className="mt-4">
        <div className="text-sm text-zinc-500">{t.my_unit_label}</div>
        <div className="mt-2">
          <UnitToggle
            unit={unit}
            onChange={setUnit}
            labels={{ km: t.unit_km, mi: t.unit_mi }}
          />
        </div>
        <p className="mt-2 text-xs text-zinc-400">{t.my_unit_pace_hint}</p>
      </Card>

      <Card className="mt-4">
        <div className="text-base font-semibold">{t.my_records_all_time}</div>
        {summaryError ? <Alert className="mt-3">{String(summaryError)}</Alert> : null}
        <div className="mt-3">
          {summaryLoading && !summary ? (
            <SkeletonLines count={3} />
          ) : !summary || summary.workoutCount === 0 ? (
            <div className="text-sm text-zinc-600">{t.my_records_empty}</div>
          ) : (
            <WorkoutAggregateStats
              stats={summary}
              showWorkoutDays
              totalLabels
              maxStreakDays={summary.maxStreakDays}
            />
          )}
        </div>
      </Card>

      <button
        type="button"
        onClick={() => nativeNavigate("/rivals")}
        className="mt-4 flex w-full items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-left hover:bg-amber-100"
      >
        <span className="text-base font-semibold text-amber-900">{t.rival_manage}</span>
        <span aria-hidden className="text-amber-400">›</span>
      </button>

      <MyRacesSection user={user} />

      <button
        type="button"
        onClick={async () => {
          const ok = await confirm({
            title: t.my_delete_account_title,
            message: t.my_delete_account_message,
            confirmLabel: t.my_delete_account_confirm,
            cancelLabel: t.cancel,
            destructive: true,
          });
          if (!ok) return;
          await deleteAccount(user);
          await logout();
        }}
        className="mt-4 h-11 w-full rounded-xl text-sm text-red-600 hover:bg-red-50"
      >
        {t.my_delete_account}
      </button>

      <div className="mt-6 pb-2 text-center">
        <a href="/privacy" className="text-xs text-zinc-400 underline">
          {t.privacy_title}
        </a>
      </div>
    </PageLayout>
  );
}

export default function MyPage() {
  const { user, loading } = useRequireAuth("/my");
  const { t } = useLocale();

  if (loading || !user) {
    return (
      <PageLayout title={t.my_title}>
        <LoadingCard />
      </PageLayout>
    );
  }

  return <MyPageContent user={user} />;
}
