"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { PageLayout } from "@/app/_components/PageLayout";
import { Alert } from "@/app/_components/ui/Alert";
import { Card } from "@/app/_components/ui/Card";
import { SkeletonLines } from "@/app/_components/ui/Skeleton";
import {
  invalidateAfterNicknameChange,
  useWorkoutSummary,
  useMe,
  useMyChallengeListInfinite,
} from "@/lib/api";
import { containsForbiddenText, stripForbiddenText } from "@/lib/forbiddenTextChars";
import { updateNickname, deleteAccount } from "@/lib/api/auth";
import { logout } from "@/lib/auth";
import { useConfirm } from "@/app/_components/ConfirmProvider";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import { ChallengeListItem } from "@/app/_components/ChallengeListItem";
import {
  RacePhaseFilter,
  type RacePhaseFilterValue,
} from "@/app/_components/RacePhaseFilter";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
import { WorkoutAggregateStats } from "@/app/_components/WorkoutAggregateStats";

/** 내가 참여한 레이스 — 예정·진행중 / 종료 2탭 + 무한스크롤. */
function MyRacesSection({ user }: { user: User }) {
  const { t } = useLocale();
  const [phase, setPhase] = useState<RacePhaseFilterValue>("active");
  const { data: pages, size, setSize, isLoading, isValidating, error } =
    useMyChallengeListInfinite(user, phase);

  useEffect(() => {
    void setSize(1);
  }, [phase, setSize]);

  const items = pages ? pages.flatMap((p) => p.items) : [];
  const hasNext = pages ? (pages[pages.length - 1]?.hasNext ?? false) : false;
  const initialLoading = isLoading && !pages;

  const sentinelRef = useInfiniteScroll({ hasNext, isValidating, setSize, size });

  const labels: Record<RacePhaseFilterValue, string> = {
    active: t.races_filter_active,
    ended: t.races_filter_ended,
  };

  return (
    <Card className="mt-4">
      <div className="flex flex-col gap-3">
        <div className="text-lg font-semibold">{t.my_races_heading}</div>
        <RacePhaseFilter
          value={phase}
          onChange={setPhase}
          labels={labels}
          ariaLabel={t.races_filter_label}
        />
      </div>
      {error ? <Alert className="mt-3">{String(error)}</Alert> : null}
      <div className="mt-3 grid gap-2">
        {initialLoading ? (
          <SkeletonLines count={2} />
        ) : items.length === 0 ? (
          <div className="text-sm text-zinc-600">{t.my_races_empty}</div>
        ) : (
          <>
            {items.map((c) => (
              <ChallengeListItem key={c.id} challenge={c} />
            ))}
            {hasNext ? (
              <div ref={sentinelRef} className="py-3 text-center text-sm text-zinc-400">
                {t.loading}
              </div>
            ) : null}
          </>
        )}
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
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [nicknameHint, setNicknameHint] = useState<string | null>(null);

  function onDraftChange(raw: string) {
    const stripped = stripForbiddenText(raw).slice(0, 20);
    setDraft(stripped);
    if (stripped.length !== raw.length) {
      setNicknameHint(t.my_nickname_invalid_chars);
    } else {
      setNicknameHint(null);
    }
    setNicknameError(null);
  }

  function startEdit() {
    setDraft(me?.nickname ?? "");
    setNicknameError(null);
    setNicknameHint(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setNicknameError(null);
    setNicknameHint(null);
  }

  async function saveNickname() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed.length > 20) return;
    if (containsForbiddenText(trimmed)) {
      setNicknameError(t.my_nickname_invalid_chars);
      return;
    }
    setSaving(true);
    setNicknameError(null);
    try {
      await updateNickname(user, trimmed);
      invalidateAfterNicknameChange(user.uid);
      setEditing(false);
    } catch (e) {
      const msg = String(e);
      if (msg.includes("nickname_taken")) {
        setNicknameError(t.my_nickname_taken);
      } else if (msg.includes("invalid_nickname_chars")) {
        setNicknameError(t.my_nickname_invalid_chars);
      } else {
        setNicknameError(t.error_occurred);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageLayout title={t.my_title}>
      <Card>
        <div className="text-sm text-zinc-500">{t.my_account_label}</div>
        <div className="mt-1 text-sm text-zinc-600">{user.email ?? ""}</div>

        <div className="mt-4">
          <div className="text-sm text-zinc-500">{t.my_nickname_label}</div>
          {editing ? (
            <div className="mt-1">
              <input
                type="text"
                value={draft}
                onChange={(e) => onDraftChange(e.target.value)}
                maxLength={20}
                placeholder={t.my_nickname_placeholder}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
              />
              {nicknameHint ? (
                <p className="mt-1 text-xs text-zinc-500">{nicknameHint}</p>
              ) : null}
              {nicknameError ? (
                <p className="mt-1 text-xs text-red-600">{nicknameError}</p>
              ) : null}
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={saveNickname}
                  disabled={saving || !draft.trim()}
                  className="h-9 rounded-lg bg-zinc-900 px-4 text-sm text-white disabled:opacity-50"
                >
                  {saving ? t.saving : t.my_nickname_save}
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={saving}
                  className="h-9 rounded-lg border border-zinc-200 px-4 text-sm text-zinc-700"
                >
                  {t.my_nickname_cancel}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-1 flex items-center gap-2">
              <span className="text-lg font-medium">
                {meLoading ? "..." : (me?.nickname ?? t.no_name)}
              </span>
              <button
                type="button"
                onClick={startEdit}
                className="text-sm text-zinc-500 underline"
              >
                {t.my_nickname_edit}
              </button>
            </div>
          )}
        </div>
      </Card>

      <Card className="mt-4">
        <div className="text-sm text-zinc-500">{t.my_unit_label}</div>
        <div className="mt-2 inline-flex rounded-lg border border-zinc-200 p-0.5">
          {(["km", "mi"] as const).map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => setUnit(u)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                unit === u
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              {u === "km" ? t.unit_km : t.unit_mi}
            </button>
          ))}
        </div>
      </Card>

      <Card className="mt-4">
        <div className="text-lg font-semibold">{t.my_records_all_time}</div>
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
        <Card className="text-sm text-zinc-600">{t.loading}</Card>
      </PageLayout>
    );
  }

  return <MyPageContent user={user} />;
}
