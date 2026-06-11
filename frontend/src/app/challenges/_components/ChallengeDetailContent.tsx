"use client";

import { PageLayout } from "@/app/_components/PageLayout";
import { useConfirm } from "@/app/_components/ConfirmProvider";
import { Alert } from "@/app/_components/ui/Alert";
import { Card } from "@/app/_components/ui/Card";
import { Skeleton } from "@/app/_components/ui/Skeleton";
import {
  deleteChallenge,
  firstErrorMessage,
  joinChallenge,
  leaveChallenge,
  invalidateChallengeLists,
  useChallengeDetail,
} from "@/lib/api";
import { useIndoorRunApprovals } from "@/app/challenges/_components/useIndoorRunApprovals";
import Link from "next/link";
import { track } from "@/lib/analytics";
import { ChallengePhaseBadge } from "@/app/_components/ChallengePhaseBadge";
import { ImageLightbox } from "@/app/_components/ImageLightbox";
import { handleAuthFailure, redirectToLogin } from "@/lib/auth";
import { getAppUrl } from "@/lib/appUrl";
import { challengeEditHref, parseChallengeId } from "@/lib/challengeRoute";
import { ChallengeMemberWorkouts } from "@/app/challenges/_components/ChallengeMemberWorkouts";
import { ChallengeLeaderboard } from "@/app/challenges/_components/ChallengeLeaderboard";
import { PendingRunCard, RejectedRunCard } from "@/app/challenges/_components/IndoorRunCard";
import { Button } from "@/app/_components/ui/Button";
import { ShareButton } from "@/app/_components/ShareButton";
import { formatDateRange } from "@/lib/format";
import { useAuthUser } from "@/lib/useAuthUser";
import { nativeNavigate } from "@/lib/nativeNav";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import { formatGoalDistance } from "@/lib/units";
import { useParams } from "next/navigation";
import { useCallback, useMemo, useState, type ReactNode } from "react";

/** 실내러닝 승인 대기·거부 카드 묶음의 공통 껍데기(제목 + 안내 + 카드 목록). */
function ApprovalSection({
  heading,
  notice,
  children,
}: {
  heading: string;
  notice: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="mt-6">
      <div className="text-base font-semibold">{heading}</div>
      <p className="mt-1 text-xs text-zinc-500">{notice}</p>
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </Card>
  );
}

export default function ChallengeDetailContent() {
  const { user, loading: authLoading } = useAuthUser();
  const confirm = useConfirm();
  const { t, locale } = useLocale();
  const { unit } = useUnit();
  const [actionError, setActionError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [expandedImageUrl, setExpandedImageUrl] = useState<string | null>(null);

  const params = useParams();
  const id = useMemo(() => parseChallengeId(String(params?.id ?? "")), [params?.id]);

  const {
    data: detail,
    isLoading,
    error: fetchError,
    mutate,
  } = useChallengeDetail(id, user, authLoading);

  const { pendingApprovals, rejectedApprovals, votingId, onVote } = useIndoorRunApprovals({
    id,
    user,
    detail,
    mutateDetail: mutate,
    onError: setActionError,
  });

  const error = firstErrorMessage(actionError, fetchError);

  const onEditClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (!user) { e.preventDefault(); redirectToLogin(id ? challengeEditHref(id) : undefined); }
    },
    [user, id],
  );

  const onDelete = useCallback(async () => {
    if (!user || !detail || !id) { redirectToLogin(id ? `/challenges/${id}` : undefined); return; }
    const ok = await confirm({ title: t.detail_delete_title, message: t.detail_delete_message, confirmLabel: t.delete, destructive: true });
    if (!ok) return;
    setActionError(null);
    try {
      await deleteChallenge(id, user, `/challenges/${id}`);
      invalidateChallengeLists();
      nativeNavigate("/challenges", { replace: true });
    } catch (e) {
      if (!handleAuthFailure(e, `/challenges/${id}`)) setActionError(String(e));
    }
  }, [user, detail, id, confirm, t]);

  async function onJoin() {
    if (!user || !id) { redirectToLogin(`/challenges/${id}`); return; }
    setJoining(true);
    setActionError(null);
    try {
      await joinChallenge(id, user, `/challenges/${id}`);
      invalidateChallengeLists();
      void track("race_joined", { challengeId: id });
      await mutate();
    } catch (e) {
      if (!handleAuthFailure(e, `/challenges/${id}`)) setActionError(String(e));
    } finally {
      setJoining(false);
    }
  }

  async function onLeave() {
    if (!user || !id || !detail) { redirectToLogin(`/challenges/${id}`); return; }
    const ok = await confirm({
      title: t.detail_leave_title,
      message: t.detail_leave_message,
      confirmLabel: t.detail_leave,
      cancelLabel: t.cancel,
      destructive: true,
    });
    if (!ok) return;
    setLeaving(true);
    setActionError(null);
    try {
      await leaveChallenge(id, user, `/challenges/${id}`);
      invalidateChallengeLists();
      await mutate();
    } catch (e) {
      if (!handleAuthFailure(e, `/challenges/${id}`)) setActionError(String(e));
    } finally {
      setLeaving(false);
    }
  }



  async function onShare() {
    if (!detail || id == null) return;
    const { shareLink } = await import("@/lib/shareCard");
    return shareLink(`${getAppUrl()}/challenges/${id}`, detail.title);
  }

  const pageActions = useMemo(
    () => (
      <>
        {detail?.showManage ? (
          <div className="relative">
            <button type="button" onClick={() => setMenuOpen((v) => !v)}
              className="h-9 w-9 rounded-xl border border-zinc-200 bg-white text-lg leading-none" aria-label={t.detail_menu_label}>
              ⋯
            </button>
            {menuOpen ? (
              <div className="absolute right-0 z-10 mt-1 w-36 rounded-xl border border-zinc-200 bg-white py-1 shadow-lg">
                <a href={id ? challengeEditHref(id) : "#"} onClick={onEditClick} className="block px-4 py-2 text-sm hover:bg-zinc-50">{t.detail_edit}</a>
                <button type="button" onClick={() => { setMenuOpen(false); onDelete(); }} className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-zinc-50">{t.detail_delete}</button>
              </div>
            ) : null}
          </div>
        ) : null}
        <Link className="text-sm text-zinc-600 hover:underline" href="/challenges">{t.detail_list_link}</Link>
      </>
    ),
    [detail?.showManage, menuOpen, id, t, onEditClick, onDelete],
  );

  return (
    <PageLayout
      title={t.detail_title}
      actions={pageActions}
    >
      {error ? <Alert className="mb-4">{error}</Alert> : null}

      {isLoading && !detail ? (
        // 첫 로드 스켈레톤 (캐시 데이터가 없을 때만)
        <Card>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="mt-3 h-4 w-32" />
          <Skeleton className="mt-2 h-3 w-40" />
        </Card>
      ) : !detail ? null : (
        <>
          <Card>
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">{detail.title}</div>
              <ChallengePhaseBadge
                startAt={detail.startAt}
                endAt={detail.endAt}
                phase={
                  detail.hasEnded
                    ? "ended"
                    : detail.hasStarted
                      ? "in_progress"
                      : "scheduled"
                }
              />
            </div>
            <div className="mt-2 text-sm text-zinc-600">
              {t.detail_goal_members(formatGoalDistance(detail.goalKm, unit), detail.memberCount, detail.maxMembers)}
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              {formatDateRange(detail.startAt, detail.endAt, locale)}
            </div>
          </Card>

          <ChallengeLeaderboard
            members={detail.members}
            goalKm={detail.goalKm}
            hasStarted={detail.hasStarted}
            hasEnded={detail.hasEnded}
            myUserId={detail.currentUserId}
          />



          {id != null && detail.hasStarted ? (
            <ChallengeMemberWorkouts
              challengeId={id}
              isMember={detail.isMember}
              user={user}
            />
          ) : null}

          {/* 실내러닝 승인 대기건 */}
          {detail.isMember && detail.hasStarted && pendingApprovals.length > 0 ? (
            <ApprovalSection
              heading={t.pending_approvals_heading}
              notice={`${t.pending_approvals_notice} ${t.pending_approvals_reject_notice}`}
            >
              {pendingApprovals.map((item) => (
                <PendingRunCard
                  key={item.challengeWorkoutId}
                  item={item}
                  votingId={votingId}
                  onVote={onVote}
                  onExpandImage={setExpandedImageUrl}
                />
              ))}
            </ApprovalSection>
          ) : null}

          {/* 거부된 실내러닝 */}
          {detail.isMember && detail.hasStarted && rejectedApprovals.length > 0 ? (
            <ApprovalSection
              heading={t.rejected_approvals_heading}
              notice={t.rejected_approval_notice}
            >
              {rejectedApprovals.map((item) => (
                <RejectedRunCard
                  key={item.challengeWorkoutId}
                  item={item}
                  onExpandImage={setExpandedImageUrl}
                />
              ))}
            </ApprovalSection>
          ) : null}

          {detail.canJoin || detail.canLeave ? (
            <div className="mt-4">
              {detail.canJoin ? (
                <Button
                  variant="primary"
                  disabled={joining}
                  onClick={onJoin}
                  className="h-12 w-full"
                >
                  {joining ? t.detail_joining : t.detail_join}
                </Button>
              ) : (
                <button
                  type="button"
                  disabled={leaving}
                  onClick={onLeave}
                  className="h-12 w-full rounded-xl border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
                >
                  {leaving ? t.detail_leaving : t.detail_leave}
                </button>
              )}
            </div>
          ) : null}

          <div className="mt-4">
            <ShareButton onShare={onShare} variant="secondary" className="h-11 w-full" />
          </div>
        </>
      )}
      {expandedImageUrl ? (
        <ImageLightbox
          src={expandedImageUrl}
          alt={t.indoor_field_image}
          onClose={() => setExpandedImageUrl(null)}
        />
      ) : null}
    </PageLayout>
  );
}
