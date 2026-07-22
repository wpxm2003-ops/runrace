"use client";

import { useState, useSyncExternalStore } from "react";
import type { User } from "firebase/auth";
import { PageLayout } from "@/app/_components/PageLayout";
import { Alert } from "@/app/_components/ui/Alert";
import { Card } from "@/app/_components/ui/Card";
import { SkeletonLines } from "@/app/_components/ui/Skeleton";
import { Button } from "@/app/_components/ui/Button";
import { BottomSheet } from "@/app/_components/ui/BottomSheet";
import { TextArea } from "@/app/_components/ui/TextInput";
import { ImageLightbox } from "@/app/_components/ImageLightbox";
import {
  applyToCrew,
  cancelJoinRequest,
  firstErrorMessage,
  fetchErrorMessage,
  invalidateCrewDetail,
  invalidateMyApplications,
  mapErrorMessage,
  reportAndDisplay,
  useCrewDetail,
  useMyApplications,
  useMyCrew,
} from "@/lib/api";
import type { CrewDetail } from "@/lib/api/types";
import { crewRegionLabel } from "@/lib/crewRegion";
import { redirectToLogin } from "@/lib/auth";
import { nativeNavigate } from "@/lib/nativeNav";
import { crewDetailHref, parseCrewId, parseCrewIdFromPath } from "@/lib/crewRoute";
import { useAuthUser } from "@/lib/useAuthUser";
import { useLocale } from "@/lib/i18n";
import { formatDate, formatDateOnly, weekdayLabels } from "@/lib/format";
import { stripForbiddenText } from "@/lib/forbiddenTextChars";
import { toast } from "sonner";

const MESSAGE_MAX = 100;

function applyErrorMessage(e: unknown, t: ReturnType<typeof useLocale>["t"]): string {
  return mapErrorMessage(
    e,
    [
      { codes: ["already_in_crew"], message: t.crew_detail_apply_already_in_crew },
      { codes: ["crew_full"], message: t.crew_detail_apply_full },
      { codes: ["apply_cooldown"], message: t.crew_detail_apply_cooldown },
      { codes: ["apply_rate_limited"], message: t.crew_detail_apply_rate_limited },
    ],
    () => reportAndDisplay(e),
  );
}

/** 가입 신청 모달 — 한마디(선택) 입력 후 전송. */
function ApplyModal({
  onClose,
  onSubmit,
  submitting,
}: {
  onClose: () => void;
  onSubmit: (message: string) => void;
  submitting: boolean;
}) {
  const { t } = useLocale();
  const [message, setMessage] = useState("");

  return (
    <BottomSheet onClose={onClose} panelClassName="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-zinc-900">
          {t.crew_detail_apply_modal_title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.cancel}
          className="-mr-1 rounded-lg p-1 text-zinc-400 hover:bg-zinc-100"
        >
          ✕
        </button>
      </div>
      <label className="mt-4 block text-sm text-zinc-500" htmlFor="crew-apply-message">
        {t.crew_detail_apply_message_label}
      </label>
      <TextArea
        id="crew-apply-message"
        value={message}
        onChange={(e) => setMessage(stripForbiddenText(e.target.value).slice(0, MESSAGE_MAX))}
        placeholder={t.crew_detail_apply_message_placeholder}
        maxLength={MESSAGE_MAX}
        rows={3}
        className="mt-1.5 w-full"
      />
      <button
        type="button"
        disabled={submitting}
        onClick={() => onSubmit(message.trim())}
        className="mt-4 h-11 w-full rounded-xl bg-zinc-900 text-sm text-white disabled:opacity-50"
      >
        {submitting ? t.crew_detail_apply_busy : t.crew_detail_apply_submit_btn}
      </button>
    </BottomSheet>
  );
}

/** 가입 신청 CTA — 로그인/소속 상태·정원·쿨다운·대기중을 전부 분기한다. */
function ApplyCta({
  user,
  detail,
  isOwnCrew,
  inOtherCrew,
  pendingRequestId,
  canceling,
  onOpenApply,
  onCancel,
}: {
  user: User | null | undefined;
  detail: CrewDetail;
  isOwnCrew: boolean;
  inOtherCrew: boolean;
  pendingRequestId: number | null;
  canceling: boolean;
  onOpenApply: () => void;
  onCancel: () => void;
}) {
  const { t } = useLocale();

  if (!user) {
    return (
      <Button
        variant="primary"
        onClick={() => redirectToLogin(crewDetailHref(detail.id))}
        className="h-12 w-full"
      >
        {t.crew_detail_login_btn}
      </Button>
    );
  }
  if (isOwnCrew) {
    return (
      <Button variant="primary" onClick={() => nativeNavigate("/crew")} className="h-12 w-full">
        {t.crew_detail_go_my_crew_btn}
      </Button>
    );
  }
  if (inOtherCrew) {
    return (
      <div>
        <Button variant="primary" disabled className="h-12 w-full">
          {t.crew_detail_apply_btn}
        </Button>
        <p className="mt-2 text-center text-xs text-zinc-500">
          {t.crew_detail_apply_already_in_crew}
        </p>
      </div>
    );
  }
  if (pendingRequestId != null) {
    return (
      <div className="flex gap-2">
        <Button variant="secondary" disabled className="h-12 flex-1 border-amber-200 bg-amber-50 text-amber-700">
          {t.crew_detail_apply_pending}
        </Button>
        <Button variant="secondary" disabled={canceling} onClick={onCancel} className="h-12 px-4">
          {t.crew_detail_apply_cancel_btn}
        </Button>
      </div>
    );
  }
  if (detail.inCooldown) {
    return (
      <div>
        <Button variant="primary" disabled className="h-12 w-full">
          {t.crew_detail_apply_btn}
        </Button>
        <p className="mt-2 text-center text-xs text-zinc-500">{t.crew_detail_apply_cooldown}</p>
      </div>
    );
  }
  if (detail.isFull) {
    return (
      <Button variant="primary" disabled className="h-12 w-full">
        {t.crew_detail_apply_full}
      </Button>
    );
  }
  return (
    <Button variant="primary" onClick={onOpenApply} className="h-12 w-full">
      {t.crew_detail_apply_btn}
    </Button>
  );
}

export default function CrewDetailContent() {
  const { user } = useAuthUser();
  const { t, locale } = useLocale();
  const id = useSyncExternalStore(
    () => () => {},
    () => {
      if (typeof window === "undefined") return null;
      return parseCrewIdFromPath(window.location.pathname)
        ?? parseCrewId(new URLSearchParams(window.location.search).get("id"));
    },
    () => null,
  );

  const { data: detail, isLoading, error, mutate } = useCrewDetail(id, user);
  const { data: myCrewData } = useMyCrew(user ?? null);
  const { data: myApplications } = useMyApplications(user ?? null);

  const [applyOpen, setApplyOpen] = useState(false);
  const [imageViewerIndex, setImageViewerIndex] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [canceling, setCanceling] = useState(false);

  const errorMsg = firstErrorMessage(fetchErrorMessage(error, t.crew_detail_not_found));
  const myCrew = myCrewData?.crew ?? null;
  const isOwnCrew = Boolean(myCrew && detail && myCrew.id === detail.id);
  const inOtherCrew = Boolean(myCrew && detail && myCrew.id !== detail.id);
  const pendingRequestId = detail
    ? (myApplications?.find((a) => a.crewId === detail.id)?.requestId ?? null)
    : null;

  async function onApply(message: string) {
    if (!user || !detail || submitting) return;
    setSubmitting(true);
    try {
      await applyToCrew(detail.id, message || null, user);
      toast.success(t.toast_crew_applied);
      setApplyOpen(false);
      void mutate();
      invalidateCrewDetail(detail.id);
      invalidateMyApplications(user.uid);
    } catch (e) {
      toast.error(applyErrorMessage(e, t));
    } finally {
      setSubmitting(false);
    }
  }

  async function onCancel() {
    if (!user || !detail || pendingRequestId == null || canceling) return;
    setCanceling(true);
    try {
      await cancelJoinRequest(pendingRequestId, user);
      toast.success(t.toast_crew_application_canceled);
      void mutate();
      invalidateCrewDetail(detail.id);
      invalidateMyApplications(user.uid);
    } catch (e) {
      toast.error(reportAndDisplay(e));
    } finally {
      setCanceling(false);
    }
  }

  const weekdays = weekdayLabels(locale, true);
  const hasMeetupInfo = Boolean(
    detail && (detail.meetupPlace || detail.meetupDays.length > 0 || detail.meetupTime),
  );
  const imageUrls = detail ? (detail.imageUrls?.length ? detail.imageUrls : detail.imageUrl ? [detail.imageUrl] : []) : [];

  return (
    <PageLayout title={detail?.name ?? t.crew_title}>
      {isLoading && !detail ? (
        <Card>
          <SkeletonLines count={4} />
        </Card>
      ) : errorMsg && !detail ? (
        <Card>
          <Alert>{errorMsg}</Alert>
        </Card>
      ) : !detail ? null : (
        <>
          <Card>
            {imageUrls.length > 0 ? (
              <button
                type="button"
                onClick={() => setImageViewerIndex(0)}
                className="block w-full overflow-hidden rounded-xl"
              >
                <img
                  src={imageUrls[0]}
                  alt=""
                  className="h-40 w-full rounded-xl object-cover"
                />
              </button>
            ) : (
              <div className="flex h-40 w-full items-center justify-center rounded-xl bg-zinc-100 text-4xl font-bold text-zinc-300">
                {detail.name.slice(0, 1)}
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600">
                {crewRegionLabel(detail.region, t)}
              </span>
              {detail.isFull ? (
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-500">
                  {t.crew_discovery_full_badge}
                </span>
              ) : null}
            </div>
            <div className="mt-1.5 text-lg font-bold text-zinc-900">{detail.name}</div>
            <div className="mt-0.5 text-xs text-zinc-500">
              {t.crew_member_count(detail.memberCount, detail.maxMembers)}
              {detail.leaderNickname
                ? ` · ${t.crew_detail_leader_label} ${detail.leaderNickname}`
                : ""}
            </div>
            <div className="mt-0.5 text-[11px] text-zinc-400">
              {t.crew_detail_created_label(
                detail.foundedAt
                  ? formatDateOnly(detail.foundedAt, locale)
                  : formatDate(detail.createdAt, locale),
              )}
            </div>

            <div className="mt-4">
              <ApplyCta
                user={user}
                detail={detail}
                isOwnCrew={isOwnCrew}
                inOtherCrew={inOtherCrew}
                pendingRequestId={pendingRequestId}
                canceling={canceling}
                onOpenApply={() => setApplyOpen(true)}
                onCancel={onCancel}
              />
            </div>
          </Card>

          <Card className="mt-4">
            <div className="text-base font-semibold">{t.crew_detail_intro_heading}</div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
              {detail.intro || t.crew_detail_intro_empty}
            </p>
          </Card>

          <Card className="mt-4">
            <div className="text-base font-semibold">{t.crew_detail_meetup_heading}</div>
            {hasMeetupInfo ? (
              <div className="mt-2 flex flex-col gap-1.5 text-sm text-zinc-700">
                {detail.meetupPlace ? (
                  <div>
                    <span className="mr-1.5 text-zinc-400">{t.crew_detail_meetup_place_label}</span>
                    {detail.meetupPlace}
                  </div>
                ) : null}
                {detail.meetupDays.length > 0 ? (
                  <div>
                    <span className="mr-1.5 text-zinc-400">{t.crew_detail_meetup_days_label}</span>
                    {detail.meetupDays.map((d) => weekdays[d]).join(", ")}
                  </div>
                ) : null}
                {detail.meetupTime ? (
                  <div>
                    <span className="mr-1.5 text-zinc-400">{t.crew_detail_meetup_time_label}</span>
                    {detail.meetupTime}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-sm text-zinc-500">{t.crew_detail_meetup_empty}</p>
            )}
          </Card>
        </>
      )}

      {applyOpen ? (
        <ApplyModal
          onClose={() => setApplyOpen(false)}
          onSubmit={onApply}
          submitting={submitting}
        />
      ) : null}
      {imageViewerIndex != null && imageUrls.length > 0 ? (
        <ImageLightbox
          imageUrls={imageUrls}
          initialIndex={imageViewerIndex}
          onClose={() => setImageViewerIndex(null)}
        />
      ) : null}
    </PageLayout>
  );
}
