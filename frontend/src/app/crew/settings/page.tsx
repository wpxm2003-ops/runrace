"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { PageLayout } from "@/app/_components/PageLayout";
import { Alert } from "@/app/_components/ui/Alert";
import { Card } from "@/app/_components/ui/Card";
import { LoadingCard } from "@/app/_components/ui/LoadingCard";
import { SkeletonLines } from "@/app/_components/ui/Skeleton";
import {
  updateCrew,
  disbandCrew,
  leaveCrew,
  kickCrewMember,
  useMyCrew,
  invalidateMyCrew,
  toDisplayError,
  reportAndDisplay,
} from "@/lib/api";
import type { CrewView } from "@/lib/api/types";
import { stripForbiddenText } from "@/lib/forbiddenTextChars";
import { handleAuthFailure } from "@/lib/auth";
import { useConfirm } from "@/app/_components/ConfirmProvider";
import { nativeNavigate } from "@/lib/nativeNav";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useLocale } from "@/lib/i18n";
import { toast } from "sonner";

/** 리더 전용 — 이름·공지·주간 목표 수정 폼. */
function EditSection({ crew, user, onSaved }: { crew: CrewView; user: User; onSaved: () => void }) {
  const { t } = useLocale();
  const [notice, setNotice] = useState(crew.notice ?? "");
  const [goal, setGoal] = useState(crew.weekGoalKm != null ? String(crew.weekGoalKm) : "");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // 백그라운드 재검증으로 crew 값이 갱신되면 편집 전 초기값도 따라가게 한다(편집 중엔 유지).
  useEffect(() => {
    setNotice(crew.notice ?? "");
    setGoal(crew.weekGoalKm != null ? String(crew.weekGoalKm) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crew.id]);

  async function onSave() {
    if (saving) return;
    // 주간 목표 — 비우면 목표 없음, 값이 있으면 1~9,999 검증(서버와 동일 규칙).
    const goalRaw = goal.trim();
    const goalKm = goalRaw === "" ? null : Number(goalRaw);
    if (goalKm != null && (!Number.isFinite(goalKm) || goalKm < 1 || goalKm > 9999)) {
      setActionError(t.crew_err_goal_invalid);
      return;
    }
    setSaving(true);
    setActionError(null);
    try {
      await updateCrew(
        crew.id,
        { notice: notice.trim() || null, weekGoalKm: goalKm },
        user,
      );
      toast.success(t.toast_crew_saved);
      onSaved();
      nativeNavigate("/crew", { replace: true });
    } catch (e) {
      if (!handleAuthFailure(e, "/crew/settings")) {
        const msg = String(e);
        setActionError(
          msg.includes("crew_name_taken")
            ? t.crew_err_name_taken
            : msg.includes("invalid_crew_name")
              ? t.crew_err_name_invalid
              : msg.includes("invalid_week_goal")
                ? t.crew_err_goal_invalid
                : (toDisplayError(e) ?? t.error_occurred),
        );
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <label className="text-sm text-zinc-500" htmlFor="crew-name">
        {t.crew_field_name}
      </label>
      <div id="crew-name" className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-zinc-100 px-3 py-2 text-sm text-zinc-600">
        {crew.name}
      </div>
      <label className="mt-4 block text-sm text-zinc-500" htmlFor="crew-notice">
        {t.crew_field_notice}
      </label>
      <input
        id="crew-notice"
        type="text"
        value={notice}
        onChange={(e) => setNotice(stripForbiddenText(e.target.value).slice(0, 100))}
        placeholder={t.crew_field_notice_placeholder}
        maxLength={100}
        className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
      />
      <label className="mt-4 block text-sm text-zinc-500" htmlFor="crew-goal">
        {t.crew_field_goal}
      </label>
      <input
        id="crew-goal"
        type="text"
        inputMode="decimal"
        value={goal}
        onChange={(e) => setGoal(e.target.value.replace(/[^0-9.]/g, "").slice(0, 7))}
        placeholder={t.crew_field_goal_placeholder}
        className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
      />
      <p className="mt-1.5 text-xs text-zinc-400">{t.crew_field_goal_hint}</p>
      {actionError ? <p className="mt-2 text-xs text-red-600">{actionError}</p> : null}
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="mt-4 h-10 w-full rounded-xl bg-zinc-900 text-sm text-white disabled:opacity-50"
      >
        {saving ? t.saving : t.save}
      </button>
    </Card>
  );
}

/** 리더 전용 — 멤버 목록 + 내보내기. */
function MemberSection({ crew, user, onChanged }: { crew: CrewView; user: User; onChanged: () => void }) {
  const { t } = useLocale();
  const confirm = useConfirm();
  const [kickingId, setKickingId] = useState<string | null>(null);

  async function onKick(memberUserId: string, nickname: string | null) {
    const ok = await confirm({
      title: t.crew_kick_confirm_title,
      message: t.crew_kick_confirm_message(nickname ?? t.no_name),
      confirmLabel: t.crew_kick_btn,
      cancelLabel: t.cancel,
      destructive: true,
    });
    if (!ok) return;
    setKickingId(memberUserId);
    try {
      await kickCrewMember(crew.id, memberUserId, user);
      toast.success(t.toast_crew_kicked);
      onChanged();
    } catch (e) {
      if (!handleAuthFailure(e, "/crew/settings")) toast.error(reportAndDisplay(e) ?? t.error_occurred);
    } finally {
      setKickingId(null);
    }
  }

  return (
    <Card className="mt-4">
      <div className="text-base font-semibold">{t.crew_members_heading}</div>
      <div className="mt-3 flex flex-col gap-2">
        {crew.members.map((m) => (
          <div
            key={m.userId}
            className="flex items-center justify-between gap-3 rounded-xl border border-zinc-100 p-3"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-medium text-zinc-900">
                {m.nickname ?? t.no_name}
              </span>
              {m.isLeader ? (
                <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                  {t.crew_leader_badge}
                </span>
              ) : null}
              {m.isMe ? (
                <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                  {t.crew_me_badge}
                </span>
              ) : null}
            </div>
            {!m.isMe ? (
              <button
                type="button"
                disabled={kickingId === m.userId}
                onClick={() => onKick(m.userId, m.nickname)}
                className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
              >
                {t.crew_kick_btn}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </Card>
  );
}

function SettingsContent({ user }: { user: User }) {
  const { t } = useLocale();
  const confirm = useConfirm();
  const { data, isLoading, error, mutate } = useMyCrew(user);
  const [busy, setBusy] = useState(false);

  // 미소속(해체 직후·직접 URL 진입 등) — 크루 홈으로 되돌린다.
  const noCrew = !!data && !data.crew;
  useEffect(() => {
    if (noCrew) nativeNavigate("/crew", { replace: true });
  }, [noCrew]);

  if (error) {
    return (
      <Card>
        <Alert>{toDisplayError(error)}</Alert>
      </Card>
    );
  }
  if (isLoading && !data) {
    return (
      <Card>
        <SkeletonLines count={3} />
      </Card>
    );
  }
  if (!data?.crew) return null;
  const crew = data.crew;

  function refresh() {
    void mutate();
    invalidateMyCrew(user.uid);
  }

  async function onDisband() {
    const ok = await confirm({
      title: t.crew_disband_confirm_title,
      message: t.crew_disband_confirm_message,
      confirmLabel: t.crew_disband_btn,
      cancelLabel: t.cancel,
      destructive: true,
    });
    if (!ok || busy) return;
    setBusy(true);
    try {
      await disbandCrew(crew.id, user);
      toast.success(t.toast_crew_disbanded);
      refresh();
      nativeNavigate("/crew", { replace: true });
    } catch (e) {
      if (!handleAuthFailure(e, "/crew/settings")) toast.error(reportAndDisplay(e) ?? t.error_occurred);
      setBusy(false);
    }
  }

  async function onLeave() {
    const ok = await confirm({
      title: t.crew_leave_confirm_title,
      message: t.crew_leave_confirm_message,
      confirmLabel: t.crew_leave_btn,
      cancelLabel: t.cancel,
      destructive: true,
    });
    if (!ok || busy) return;
    setBusy(true);
    try {
      await leaveCrew(user);
      toast.success(t.toast_crew_left);
      refresh();
      nativeNavigate("/crew", { replace: true });
    } catch (e) {
      if (!handleAuthFailure(e, "/crew/settings")) toast.error(reportAndDisplay(e) ?? t.error_occurred);
      setBusy(false);
    }
  }

  return (
    <>
      {crew.isLeader ? (
        <>
          <EditSection crew={crew} user={user} onSaved={refresh} />
          <MemberSection crew={crew} user={user} onChanged={refresh} />
          <button
            type="button"
            disabled={busy}
            onClick={onDisband}
            className="mt-4 h-11 w-full rounded-xl text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {t.crew_disband_btn}
          </button>
        </>
      ) : (
        <>
          <Card>
            <div className="text-lg font-bold text-zinc-900">{crew.name}</div>
            <div className="mt-0.5 text-xs text-zinc-500">
              {t.crew_member_count(crew.members.length, crew.maxMembers)}
            </div>
          </Card>
          <button
            type="button"
            disabled={busy}
            onClick={onLeave}
            className="mt-4 h-11 w-full rounded-xl text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {t.crew_leave_btn}
          </button>
        </>
      )}
    </>
  );
}

export default function CrewSettingsPage() {
  const { user, loading } = useRequireAuth("/crew/settings");
  const { t } = useLocale();

  if (loading || !user) {
    return (
      <PageLayout title={t.crew_settings_title}>
        <LoadingCard />
      </PageLayout>
    );
  }

  return (
    <PageLayout title={t.crew_settings_title}>
      <SettingsContent user={user} />
    </PageLayout>
  );
}
