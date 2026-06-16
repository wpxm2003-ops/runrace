"use client";

import { PageLayout } from "@/app/_components/PageLayout";
import { useConfirm } from "@/app/_components/ConfirmProvider";
import { Alert } from "@/app/_components/ui/Alert";
import { Card } from "@/app/_components/ui/Card";
import { Skeleton } from "@/app/_components/ui/Skeleton";
import {
  deleteChallenge,
  firstErrorMessage,
  isNotFoundError,
  joinChallenge,
  leaveChallenge,
  invalidateChallengeLists,
  nudgeMember,
  useChallengeDetail,
  useHeadToHead,
} from "@/lib/api";
import { useIndoorRunApprovals } from "@/app/challenges/_components/useIndoorRunApprovals";
import Link from "next/link";
import { track } from "@/lib/analytics";
import { ChallengePhaseBadge } from "@/app/_components/ChallengePhaseBadge";
import { ImageLightbox } from "@/app/_components/ImageLightbox";
import { handleAuthFailure, redirectToLogin } from "@/lib/auth";
import { getAppUrl } from "@/lib/appUrl";
import { challengeEditHref, parseChallengeIdFromPath } from "@/lib/challengeRoute";
import { ChallengeMemberWorkouts } from "@/app/challenges/_components/ChallengeMemberWorkouts";
import {
  ChallengeLeaderboard,
  type HeadToHeadMap,
} from "@/app/challenges/_components/ChallengeLeaderboard";
import { PendingRunCard, RejectedRunCard } from "@/app/challenges/_components/IndoorRunCard";
import { Button } from "@/app/_components/ui/Button";
import { ShareButton } from "@/app/_components/ShareButton";
import { formatDateRange } from "@/lib/format";
import { useAuthUser } from "@/lib/useAuthUser";
import { nativeNavigate } from "@/lib/nativeNav";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import { formatGoalDistance } from "@/lib/units";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

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
  const { user } = useAuthUser();
  const confirm = useConfirm();
  const { t, locale } = useLocale();
  const { unit } = useUnit();
  const [actionError, setActionError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [expandedImageUrl, setExpandedImageUrl] = useState<string | null>(null);
  const [nudgingId, setNudgingId] = useState<string | null>(null);
  const [nudgedIds, setNudgedIds] = useState<Set<string>>(() => new Set());

  // 단일 템플릿(challenges/view.html)이 모든 id로 서빙되므로, 라우터 param 대신
  // 실제 URL에서 id를 읽는다. 빌드/클라 초기 렌더는 null로 일치시켜 하이드레이션 미스매치를 막고,
  // 마운트 후 useEffect에서 window.location으로 실제 id를 채운다.
  const pathname = usePathname();
  const [id, setId] = useState<number | null>(null);
  useEffect(() => {
    setId(parseChallengeIdFromPath(window.location.pathname));
  }, [pathname]);

  const {
    data: detail,
    isLoading,
    error: fetchError,
    mutate,
  } = useChallengeDetail(id, user);

  const { pendingApprovals, rejectedApprovals, votingId, onVote } = useIndoorRunApprovals({
    id,
    user,
    detail,
    mutateDetail: mutate,
    onError: setActionError,
  });

  // 종료된 레이스 + 참여자일 때만 전적 조회(엔드포인트는 인증 필요, 라이벌만 반환).
  const { data: headToHeadRows } = useHeadToHead(
    id,
    user ?? null,
    Boolean(detail?.hasEnded && detail?.isMember),
  );
  const headToHead = useMemo<HeadToHeadMap | undefined>(() => {
    if (!headToHeadRows) return undefined;
    const map: HeadToHeadMap = new Map();
    for (const r of headToHeadRows) {
      map.set(r.opponentUserId, { wins: r.wins, losses: r.losses });
    }
    return map;
  }, [headToHeadRows]);

  const fetchErrorMsg = fetchError
    ? isNotFoundError(fetchError)
      ? t.detail_not_found
      : String(fetchError)
    : null;
  const error = firstErrorMessage(actionError, fetchErrorMsg);

  // 액션 피드백(콕 찌르기·참여/탈퇴 등) 에러는 5초 뒤 자동으로 지운다. 로드 실패(fetchError)는 유지.
  useEffect(() => {
    if (!actionError) return;
    const timer = setTimeout(() => setActionError(null), 5000);
    return () => clearTimeout(timer);
  }, [actionError]);

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



  const onNudge = useCallback(
    async (targetUserId: string, variant: number) => {
      if (!user || id == null) return;
      setNudgingId(targetUserId);
      setActionError(null);
      try {
        await nudgeMember(id, targetUserId, variant, user);
        setNudgedIds((prev) => new Set(prev).add(targetUserId));
      } catch (e) {
        const msg = String(e);
        setActionError(msg.includes("nudge_daily_limit") ? t.nudge_daily_limit : msg);
      } finally {
        setNudgingId(null);
      }
    },
    [user, id, t],
  );

  async function onShare() {
    if (!detail || id == null) return;
    const { shareLink } = await import("@/lib/shareCard");
    const text = `🏃 ${formatGoalDistance(detail.goalKm, unit)} · 👥 ${detail.memberCount}명`;
    return shareLink(`${getAppUrl()}/api/share/challenges/${id}`, detail.title, text);
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
      {error ? <Alert className="mb-4 whitespace-pre-line">{error}</Alert> : null}

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
            headToHead={headToHead}
            onNudge={
              detail.isMember && detail.hasStarted && !detail.hasEnded ? onNudge : undefined
            }
            nudgingId={nudgingId}
            nudgedIds={nudgedIds}
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
