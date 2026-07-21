"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { PageLayout } from "@/app/_components/PageLayout";
import { Alert } from "@/app/_components/ui/Alert";
import { Card } from "@/app/_components/ui/Card";
import { LoadingCard } from "@/app/_components/ui/LoadingCard";
import { SkeletonLines } from "@/app/_components/ui/Skeleton";
import {
  updateCrew,
  updateCrewProfile,
  uploadImage,
  disbandCrew,
  leaveCrew,
  kickCrewMember,
  approveJoinRequest,
  rejectJoinRequest,
  useMyCrew,
  useCrewDetail,
  useLeaderJoinRequests,
  invalidateMyCrew,
  invalidateCrewDetail,
  invalidateLeaderJoinRequests,
  toDisplayError,
  reportAndDisplay,
} from "@/lib/api";
import type { CrewView } from "@/lib/api/types";
import { CREW_REGIONS, crewRegionLabel, type CrewRegionCode } from "@/lib/crewRegion";
import { CrewRegionPicker, type CrewRegionOption } from "../_components/CrewRegionPicker";
import { stripForbiddenText } from "@/lib/forbiddenTextChars";
import { handleAuthFailure } from "@/lib/auth";
import { useConfirm } from "@/app/_components/ConfirmProvider";
import { useNativeBack } from "@/lib/useNativeBack";
import { nativeNavigate } from "@/lib/nativeNav";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useLocale } from "@/lib/i18n";
import { formatDate, weekdayLabels } from "@/lib/format";
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

/**
 * 리더 전용 — 발견 프로필(지역·이미지·소개·정기런) 편집.
 * 현재값은 공개 상세 응답(useCrewDetail)에서 읽는다 — myCrew 홈 응답엔 이 필드들이 없다.
 */
function ProfileSection({ crew, user, onSaved }: { crew: CrewView; user: User; onSaved: () => void }) {
  const { t, locale } = useLocale();
  const { data: detail, mutate: mutateDetail } = useCrewDetail(crew.id, user);
  const fileRef = useRef<HTMLInputElement>(null);
  const [initialized, setInitialized] = useState(false);
  const [region, setRegion] = useState<CrewRegionCode | "">("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [intro, setIntro] = useState("");
  const [meetupPlace, setMeetupPlace] = useState("");
  const [meetupDays, setMeetupDays] = useState<number[]>([]);
  const [meetupTime, setMeetupTime] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const regionOptions: CrewRegionOption[] = CREW_REGIONS.map((value) => ({
    value,
    label: crewRegionLabel(value, t),
  }));

  // 상세 응답이 처음 도착했을 때 한 번만 폼을 채운다 — 이후 백그라운드 재검증이 편집 중인 값을 덮어쓰지 않게.
  useEffect(() => {
    if (!detail || initialized) return;
    setRegion(detail.region as CrewRegionCode);
    setImageUrl(detail.imageUrl);
    setIntro(detail.intro ?? "");
    setMeetupPlace(detail.meetupPlace ?? "");
    setMeetupDays(detail.meetupDays);
    setMeetupTime(detail.meetupTime ?? "");
    setInitialized(true);
  }, [detail, initialized]);

  function toggleDay(d: number) {
    setMeetupDays((cur) =>
      cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort((a, b) => a - b),
    );
  }

  async function onPickImage(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file, user);
      setImageUrl(url);
    } catch (e) {
      toast.error(String(e).includes("upload_too_large") ? t.upload_too_large : t.error_occurred);
    } finally {
      setUploading(false);
    }
  }

  async function onSave() {
    if (saving || !region) return;
    setSaving(true);
    setActionError(null);
    try {
      await updateCrewProfile(
        crew.id,
        {
          region: region as CrewRegionCode,
          imageUrl,
          intro: intro.trim() || null,
          meetupPlace: meetupPlace.trim() || null,
          meetupDays,
          meetupTime: meetupTime.trim() || null,
        },
        user,
      );
      toast.success(t.crew_profile_saved_toast);
      void mutateDetail();
      invalidateCrewDetail(crew.id);
      onSaved();
    } catch (e) {
      if (!handleAuthFailure(e, "/crew/settings")) {
        const msg = String(e);
        setActionError(
          msg.includes("invalid_region")
            ? t.crew_err_invalid_region
            : msg.includes("invalid_image_url") ||
                msg.includes("invalid_intro") ||
                msg.includes("invalid_meetup")
              ? t.crew_err_profile_invalid
              : (toDisplayError(e) ?? t.error_occurred),
        );
      }
    } finally {
      setSaving(false);
    }
  }

  if (!detail) {
    return (
      <Card className="mt-4">
        <SkeletonLines count={3} />
      </Card>
    );
  }

  const weekdays = weekdayLabels(locale, true);

  return (
    <Card className="mt-4">
      <div className="text-base font-semibold">{t.crew_profile_heading}</div>

      <label className="mt-4 block text-sm text-zinc-500" htmlFor="crew-profile-region">
        {t.crew_profile_region_label}
      </label>
      <div id="crew-profile-region" className="mt-1.5">
        <CrewRegionPicker
          value={region}
          options={regionOptions}
          placeholder={t.crew_region_placeholder}
          title={t.crew_profile_region_label}
          onChange={(value) => setRegion(value as CrewRegionCode)}
          disabled={saving}
        />
      </div>

      <label className="mt-4 block text-sm text-zinc-500">{t.crew_profile_image_label}</label>
      <p className="mt-1 text-xs text-zinc-400">{t.crew_profile_image_hint}</p>
      <div className="mt-2 flex items-center gap-3">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="h-16 w-16 rounded-lg object-cover" />
        ) : null}
        <div className="flex flex-col gap-1.5">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              void onPickImage(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            {uploading
              ? t.prize_uploading
              : imageUrl
                ? t.crew_profile_image_replace_btn
                : t.crew_profile_image_upload_btn}
          </button>
          {imageUrl && !uploading ? (
            <button
              type="button"
              onClick={() => setImageUrl(null)}
              className="text-left text-[11px] text-zinc-400 hover:text-red-500"
            >
              {t.crew_profile_image_remove_btn}
            </button>
          ) : null}
        </div>
      </div>

      <label className="mt-4 block text-sm text-zinc-500" htmlFor="crew-profile-intro">
        {t.crew_profile_intro_label}
      </label>
      <textarea
        id="crew-profile-intro"
        value={intro}
        onChange={(e) => setIntro(stripForbiddenText(e.target.value).slice(0, 500))}
        placeholder={t.crew_profile_intro_placeholder}
        maxLength={500}
        rows={3}
        className="mt-1.5 w-full resize-none rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
      />
      <p className="mt-1 text-xs text-zinc-400">{t.crew_profile_intro_hint}</p>

      <label className="mt-4 block text-sm text-zinc-500" htmlFor="crew-profile-meetup-place">
        {t.crew_profile_meetup_place_label}
      </label>
      <input
        id="crew-profile-meetup-place"
        type="text"
        value={meetupPlace}
        onChange={(e) => setMeetupPlace(stripForbiddenText(e.target.value).slice(0, 60))}
        placeholder={t.crew_profile_meetup_place_placeholder}
        maxLength={60}
        className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
      />
      <p className="mt-1 text-xs text-zinc-400">{t.crew_profile_meetup_place_hint}</p>

      <label className="mt-4 block text-sm text-zinc-500">{t.crew_profile_meetup_days_label}</label>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {weekdays.map((w, i) => (
          <button
            key={i}
            type="button"
            onClick={() => toggleDay(i)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              meetupDays.includes(i)
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            {w}
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs text-zinc-400">{t.crew_profile_meetup_days_hint}</p>

      <label className="mt-4 block text-sm text-zinc-500" htmlFor="crew-profile-meetup-time">
        {t.crew_profile_meetup_time_label}
      </label>
      <input
        id="crew-profile-meetup-time"
        type="text"
        value={meetupTime}
        onChange={(e) => setMeetupTime(stripForbiddenText(e.target.value).slice(0, 30))}
        placeholder={t.crew_profile_meetup_time_placeholder}
        maxLength={30}
        className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
      />
      <p className="mt-1 text-xs text-zinc-400">{t.crew_profile_meetup_time_hint}</p>

      {actionError ? <p className="mt-3 text-xs text-red-600">{actionError}</p> : null}
      <button
        type="button"
        onClick={onSave}
        disabled={saving || !region}
        className="mt-4 h-10 w-full rounded-xl bg-zinc-900 text-sm text-white disabled:opacity-50"
      >
        {saving ? t.saving : t.save}
      </button>
    </Card>
  );
}

/** 거절 사유 입력 모달(선택) — 신청자에게 앱 푸시로 함께 전달된다. */
function RejectModal({
  onClose,
  onSubmit,
  submitting,
}: {
  onClose: () => void;
  onSubmit: (reason: string) => void;
  submitting: boolean;
}) {
  const { t } = useLocale();
  const [reason, setReason] = useState("");
  useNativeBack(onClose);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45 backdrop-blur-[2px] sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900">{t.crew_inbox_reject_modal_title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.cancel}
            className="-mr-1 rounded-lg p-1 text-zinc-400 hover:bg-zinc-100"
          >
            ✕
          </button>
        </div>
        <textarea
          value={reason}
          onChange={(e) => setReason(stripForbiddenText(e.target.value).slice(0, 100))}
          placeholder={t.crew_inbox_reject_reason_placeholder}
          maxLength={100}
          rows={3}
          className="mt-4 w-full resize-none rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
        />
        <button
          type="button"
          disabled={submitting}
          onClick={() => onSubmit(reason.trim())}
          className="mt-4 h-11 w-full rounded-xl bg-zinc-900 text-sm text-white disabled:opacity-50"
        >
          {submitting ? t.crew_detail_apply_busy : t.crew_inbox_reject_submit_btn}
        </button>
      </div>
    </div>
  );
}

/** 리더 전용 — 가입 신청 인박스(대기중 전체). 신청 없으면 안내문만 표시. */
function JoinRequestInbox({ user }: { user: User }) {
  const { t, locale } = useLocale();
  const { data, isLoading, mutate } = useLeaderJoinRequests(user, true);
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [rejectTarget, setRejectTarget] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState(false);

  function inboxErrorMessage(e: unknown): string {
    const msg = String(e);
    if (msg.includes("request_already_decided")) return t.crew_inbox_err_already_decided;
    if (msg.includes("applicant_already_in_crew")) return t.crew_inbox_err_applicant_already_in_crew;
    if (msg.includes("crew_full")) return t.crew_inbox_err_crew_full;
    return reportAndDisplay(e);
  }

  async function onApprove(requestId: number) {
    if (approvingId) return;
    setApprovingId(requestId);
    try {
      await approveJoinRequest(requestId, user);
      toast.success(t.toast_crew_join_approved);
      invalidateMyCrew(user.uid);
    } catch (e) {
      toast.error(inboxErrorMessage(e));
    } finally {
      setApprovingId(null);
      void mutate();
      invalidateLeaderJoinRequests(user.uid);
    }
  }

  async function onReject(reason: string) {
    if (rejectTarget == null || rejecting) return;
    setRejecting(true);
    try {
      await rejectJoinRequest(rejectTarget, reason || null, user);
      toast.success(t.toast_crew_join_rejected);
      setRejectTarget(null);
    } catch (e) {
      toast.error(inboxErrorMessage(e));
    } finally {
      setRejecting(false);
      void mutate();
      invalidateLeaderJoinRequests(user.uid);
    }
  }

  return (
    <Card className="mt-4">
      <div className="text-base font-semibold">{t.crew_inbox_heading}</div>
      {isLoading && !data ? (
        <div className="mt-3"><SkeletonLines count={2} /></div>
      ) : !data || data.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">{t.crew_inbox_empty}</p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {data.map((r) => (
            <div key={r.requestId} className="rounded-xl border border-zinc-100 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-sm font-medium text-zinc-900">
                  {r.applicantNickname ?? t.no_name}
                </span>
                <span className="shrink-0 text-[11px] text-zinc-400">
                  {formatDate(r.appliedAt, locale)}
                </span>
              </div>
              {r.message ? <p className="mt-1 text-sm text-zinc-600">{r.message}</p> : null}
              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  disabled={approvingId === r.requestId}
                  onClick={() => onApprove(r.requestId)}
                  className="h-9 flex-1 rounded-lg bg-zinc-900 text-xs font-medium text-white disabled:opacity-50"
                >
                  {t.crew_inbox_approve_btn}
                </button>
                <button
                  type="button"
                  disabled={approvingId === r.requestId}
                  onClick={() => setRejectTarget(r.requestId)}
                  className="h-9 flex-1 rounded-lg border border-zinc-200 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                >
                  {t.crew_inbox_reject_btn}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {rejectTarget != null ? (
        <RejectModal
          onClose={() => setRejectTarget(null)}
          onSubmit={onReject}
          submitting={rejecting}
        />
      ) : null}
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
          <ProfileSection crew={crew} user={user} onSaved={refresh} />
          <JoinRequestInbox user={user} />
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
