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
  useNotificationSetting,
  setNotificationSetting,
  toDisplayError,
} from "@/lib/api";
import { toast } from "sonner";
import { deleteAccount } from "@/lib/api/auth";
import { logout } from "@/lib/auth";
import { useConfirm, useAlert } from "@/app/_components/ConfirmProvider";
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

/** 푸시 알림 수신 토글 — app_user.push_enabled를 갱신한다. */
function NotificationToggle({ user }: { user: User }) {
  const { t } = useLocale();
  const alert = useAlert();
  const { data, isLoading, mutate } = useNotificationSetting(user);
  const [saving, setSaving] = useState(false);
  // 디바이스 토큰이 없으면(앱 푸시 미동의) 토글 불가 — 항상 OFF로 보이게 한다.
  const hasToken = data?.hasToken ?? false;
  const enabled = hasToken ? (data?.enabled ?? false) : false;

  async function onToggle() {
    if (isLoading || saving) return;
    // 토큰이 없으면 상태를 바꾸지 않고 안내만 띄운다(클릭해도 OFF 유지).
    if (!hasToken) {
      void alert({
        title: t.my_notification_label,
        message: t.push_no_token_message,
        confirmLabel: t.confirm,
      });
      return;
    }
    const next = !enabled;
    setSaving(true);
    void mutate({ enabled: next, hasToken }, { revalidate: false }); // 낙관적 업데이트
    try {
      await setNotificationSetting(user, next);
    } catch {
      void mutate(); // 실패 시 서버 값으로 되돌림
      toast.error(t.error_occurred);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mt-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-zinc-900">{t.my_notification_label}</div>
          <p className="mt-0.5 text-xs text-zinc-500">{t.my_notification_desc}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={t.my_notification_label}
          disabled={isLoading || saving}
          onClick={onToggle}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
            enabled ? "bg-zinc-900" : "bg-zinc-300"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
              enabled ? "left-[1.375rem]" : "left-0.5"
            }`}
          />
        </button>
      </div>
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
        <p className="mt-2 whitespace-pre-line text-xs text-zinc-400">{t.my_unit_pace_hint}</p>
      </Card>

      <NotificationToggle user={user} />

      <button
        type="button"
        onClick={() => nativeNavigate("/shoes")}
        className="mt-4 flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3.5 text-left hover:bg-zinc-50"
      >
        <span className="text-base font-semibold text-zinc-900">{t.shoe_manage}</span>
        <span aria-hidden className="text-zinc-400">›</span>
      </button>

      <button
        type="button"
        onClick={() => nativeNavigate("/rivals")}
        className="mt-4 flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3.5 text-left hover:bg-zinc-50"
      >
        <span className="text-base font-semibold text-zinc-900">{t.rival_manage}</span>
        <span aria-hidden className="text-zinc-400">›</span>
      </button>

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
