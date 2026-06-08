"use client";

import { PageLayout } from "@/app/_components/PageLayout";
import { useConfirm } from "@/app/_components/ConfirmProvider";
import { Alert } from "@/app/_components/ui/Alert";
import { Card } from "@/app/_components/ui/Card";
import { Skeleton } from "@/app/_components/ui/Skeleton";
import {
  deleteChallenge,
  fetchPendingApprovals,
  fetchRejectedApprovals,
  joinChallenge,
  leaveChallenge,
  invalidateChallengeWorkouts,
  useChallengeDetail,
  useMe,
  voteIndoorRun,
} from "@/lib/api";
import type { PendingApproval, RejectedApproval } from "@/lib/api";
import { ChallengePhaseBadge } from "@/app/_components/ChallengePhaseBadge";
import { ImageLightbox } from "@/app/_components/ImageLightbox";
import { handleAuthFailure, redirectToLogin } from "@/lib/auth";
import { challengeEditHref, parseChallengeId } from "@/lib/challengeRoute";
import { ChallengeMemberWorkouts } from "@/app/challenges/_components/ChallengeMemberWorkouts";
import { ShareButton } from "@/app/_components/ShareButton";
import { shareLink } from "@/lib/shareCard";
import { formatDateRange, formatKmAmount } from "@/lib/format";
import { useAuthUser } from "@/lib/useAuthUser";
import { nativeNavigate } from "@/lib/nativeNav";
import { useLocale } from "@/lib/i18n";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export default function ChallengeDetailContent() {
  const { user, loading: authLoading } = useAuthUser();
  const { data: me } = useMe(user);
  const confirm = useConfirm();
  const { t } = useLocale();
  const [actionError, setActionError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [rejectedApprovals, setRejectedApprovals] = useState<RejectedApproval[]>([]);
  const [votingId, setVotingId] = useState<number | null>(null);
  const [expandedImageUrl, setExpandedImageUrl] = useState<string | null>(null);

  const params = useParams();
  const id = useMemo(() => parseChallengeId(String(params?.id ?? "")), [params?.id]);

  const {
    data: detail,
    isLoading,
    error: fetchError,
    mutate,
  } = useChallengeDetail(id, user, authLoading);

  const error = actionError ?? (fetchError ? String(fetchError) : null);

  function onEditClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (!user) { e.preventDefault(); redirectToLogin(id ? challengeEditHref(id) : undefined); }
  }

  async function onDelete() {
    if (!user || !detail || !id) { redirectToLogin(id ? `/challenges/${id}` : undefined); return; }
    const ok = await confirm({ title: t.detail_delete_title, message: t.detail_delete_message, confirmLabel: t.delete, destructive: true });
    if (!ok) return;
    setActionError(null);
    try {
      await deleteChallenge(id, user, `/challenges/${id}`);
      nativeNavigate("/challenges");
    } catch (e) {
      if (!handleAuthFailure(e, `/challenges/${id}`)) setActionError(String(e));
    }
  }

  async function onJoin() {
    if (!user || !id) { redirectToLogin(`/challenges/${id}`); return; }
    setJoining(true);
    setActionError(null);
    try {
      await joinChallenge(id, user, `/challenges/${id}`);
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
      await mutate();
    } catch (e) {
      if (!handleAuthFailure(e, `/challenges/${id}`)) setActionError(String(e));
    } finally {
      setLeaving(false);
    }
  }



  async function onShare() {
    if (!detail || id == null) return;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://runrace.co.kr";
    return shareLink(`${appUrl}/challenges/${id}`, detail.title);
  }

  // 승인 대기·거부 목록 로드 (레이스 참여 중인 경우만)
  useEffect(() => {
    if (!user || !id || !detail?.isMember || !detail?.hasStarted) return;
    Promise.all([
      fetchPendingApprovals(id, user),
      fetchRejectedApprovals(id, user),
    ])
      .then(([pending, rejected]) => {
        setPendingApprovals(pending);
        setRejectedApprovals(rejected);
      })
      .catch(() => {/* 조용히 무시 */});
  }, [id, user, detail?.isMember, detail?.hasStarted]);

  async function refreshApprovalViews() {
    if (!id || !user) return;
    const [pending, rejected] = await Promise.all([
      fetchPendingApprovals(id, user),
      fetchRejectedApprovals(id, user),
    ]);
    setPendingApprovals(pending);
    setRejectedApprovals(rejected);
    await mutate();
    invalidateChallengeWorkouts(id, user.uid);
  }

  async function onVote(workoutId: number, approved: boolean) {
    if (!user) return;
    setVotingId(workoutId);
    const prevPending = pendingApprovals;
    const prevRejected = rejectedApprovals;

    // 버튼 클릭 직후 카드 상태를 먼저 반영
    const votedItem = prevPending.find((item) => item.workoutId === workoutId);
    if (!approved) {
      setPendingApprovals((items) => items.filter((item) => item.workoutId !== workoutId));
      const rejectorNickname = me?.nickname;
      if (votedItem && rejectorNickname) {
        setRejectedApprovals((items) => {
          if (items.some((r) => r.challengeWorkoutId === votedItem.challengeWorkoutId)) return items;
          return [
            {
              challengeWorkoutId: votedItem.challengeWorkoutId,
              workoutId: votedItem.workoutId,
              submitterNickname: votedItem.submitterNickname,
              distanceM: votedItem.distanceM,
              durationSec: votedItem.durationSec,
              imageUrl: votedItem.imageUrl,
              startedAt: votedItem.startedAt,
              rejectorNicknames: [rejectorNickname],
            },
            ...items,
          ];
        });
      }
    } else {
      setPendingApprovals((items) =>
        items
          .map((item) =>
            item.workoutId === workoutId
              ? {
                  ...item,
                  myVote: true,
                  approvedCount: Math.min(item.totalVoters, item.approvedCount + 1),
                }
              : item,
          )
          .filter(
            (item) =>
              !(item.workoutId === workoutId && item.approvedCount >= item.totalVoters),
          ),
      );
    }

    try {
      await voteIndoorRun(workoutId, approved, user);
      await refreshApprovalViews();
    } catch (e) {
      setPendingApprovals(prevPending);
      setRejectedApprovals(prevRejected);
      setActionError(String(e));
    } finally {
      setVotingId(null);
    }
  }

  const pageActions = (
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
      <a className="text-sm text-zinc-600 hover:underline" href="/challenges">{t.detail_list_link}</a>
    </>
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
              />
            </div>
            <div className="mt-2 text-sm text-zinc-600">
              {t.detail_goal_members(detail.goalKm, detail.memberCount, detail.maxMembers)}
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              {formatDateRange(detail.startAt, detail.endAt)}
            </div>
          </Card>

          <Card className="mt-6">
            <div className="text-lg font-semibold">
              {!detail.hasStarted
                ? t.detail_progress_scheduled
                : detail.hasEnded
                ? t.detail_progress_ended
                : t.detail_progress}
            </div>
            <div className="mt-4 flex flex-col gap-3">
              {detail.members.map((m, idx) => {
                const pct = Math.min(100, Math.max(0, Number(m.progressPercent) || 0));
                const pctLabel = Number.isInteger(pct) ? String(pct) : pct.toFixed(1);
                const isMe = me != null && m.userId === me.id;
                const showMedal = m.finished || detail.hasEnded;

                return (
                  <div
                    key={m.userId}
                    className={`rounded-xl p-3 ${
                      isMe ? "border border-emerald-200 bg-emerald-50" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        {showMedal ? (
                          idx === 0 ? (
                            <span className="shrink-0 text-lg leading-none" aria-hidden>🥇</span>
                          ) : idx === 1 ? (
                            <span className="shrink-0 text-lg leading-none" aria-hidden>🥈</span>
                          ) : idx === 2 ? (
                            <span className="shrink-0 text-lg leading-none" aria-hidden>🥉</span>
                          ) : (
                            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-500">
                              {idx + 1}
                            </span>
                          )
                        ) : (
                          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-500">
                            {idx + 1}
                          </span>
                        )}
                        <div className="min-w-0">
                          <div className={`truncate text-sm font-medium ${isMe ? "font-semibold text-emerald-900" : "text-zinc-900"}`}>
                            {m.nickname ?? t.no_name}
                          </div>
                          {m.finished ? (
                            <div className="mt-0.5 text-[11px] font-medium text-emerald-600">
                              {t.detail_finished_badge}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <div className="shrink-0 text-right tabular-nums">
                        <div className={`text-sm font-semibold ${isMe ? "text-emerald-700" : "text-zinc-900"}`}>
                          {pctLabel}%
                        </div>
                        <div className={`mt-0.5 text-[11px] ${isMe ? "text-emerald-700" : "text-zinc-500"}`}>
                          {formatKmAmount(m.totalKm)} / {detail.goalKm} km
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                      <div
                        className={`h-full rounded-full transition-all ${isMe ? "bg-emerald-600" : "bg-zinc-900"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>



          {id != null && detail.hasStarted ? (
            <ChallengeMemberWorkouts
              challengeId={id}
              isMember={detail.isMember}
              user={user}
            />
          ) : null}

          {/* 실내러닝 승인 대기건 */}
          {detail.isMember && detail.hasStarted && pendingApprovals.length > 0 ? (
            <Card className="mt-6">
              <div className="text-base font-semibold">{t.pending_approvals_heading}</div>
              <p className="mt-1 text-xs text-zinc-500">
                {t.pending_approvals_notice} {t.pending_approvals_reject_notice}
              </p>
              <div className="mt-3 flex flex-col gap-3">
                {pendingApprovals.map((item) => (
                  <div key={item.challengeWorkoutId} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-zinc-900">
                          {item.submitterNickname ?? t.no_name}
                        </div>
                        <div className="mt-0.5 text-xs text-zinc-500">
                          {(item.distanceM / 1000).toFixed(2)} km · {t.pending_approval_votes(item.approvedCount, item.totalVoters)}
                        </div>
                      </div>
                      {item.imageUrl ? (
                        <button
                          type="button"
                          onClick={() => setExpandedImageUrl(item.imageUrl)}
                          className="h-14 w-14 shrink-0 overflow-hidden rounded-lg ring-offset-1 hover:ring-2 hover:ring-zinc-300"
                          aria-label={t.pending_approval_view_image}
                        >
                          <img
                            src={item.imageUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        </button>
                      ) : null}
                    </div>
                    <div className="mt-2 flex gap-2">
                      {!item.canVote ? (
                        <div className="text-xs font-medium text-zinc-500">
                          {t.pending_approval_waiting}
                        </div>
                      ) : item.myVote === null ? (
                        <>
                          <button
                            type="button"
                            disabled={votingId === item.workoutId}
                            onClick={() => onVote(item.workoutId, true)}
                            className="flex-1 rounded-lg bg-emerald-600 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {t.pending_approval_approve}
                          </button>
                          <button
                            type="button"
                            disabled={votingId === item.workoutId}
                            onClick={() => onVote(item.workoutId, false)}
                            className="flex-1 rounded-lg border border-red-200 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                          >
                            {t.pending_approval_reject}
                          </button>
                        </>
                      ) : (
                        <div className={`text-xs font-medium ${item.myVote ? "text-emerald-600" : "text-red-500"}`}>
                          {item.myVote ? t.pending_approval_approved : t.pending_approval_rejected}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {/* 거부된 실내러닝 */}
          {detail.isMember && detail.hasStarted && rejectedApprovals.length > 0 ? (
            <Card className="mt-6">
              <div className="text-base font-semibold">{t.rejected_approvals_heading}</div>
              <p className="mt-1 text-xs text-zinc-500">{t.rejected_approval_notice}</p>
              <div className="mt-3 flex flex-col gap-3">
                {rejectedApprovals.map((item) => (
                  <div
                    key={item.challengeWorkoutId}
                    className="rounded-xl border border-red-100 bg-red-50/50 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-zinc-900">
                          {item.submitterNickname ?? t.no_name}
                        </div>
                        <div className="mt-0.5 text-xs text-zinc-500">
                          {(item.distanceM / 1000).toFixed(2)} km
                        </div>
                        {item.rejectorNicknames.length > 0 ? (
                          <div className="mt-1 text-xs font-medium text-red-600">
                            {t.rejected_approval_by(item.rejectorNicknames.join(", "))}
                          </div>
                        ) : null}
                      </div>
                      {item.imageUrl ? (
                        <button
                          type="button"
                          onClick={() => setExpandedImageUrl(item.imageUrl)}
                          className="h-14 w-14 shrink-0 overflow-hidden rounded-lg ring-offset-1 hover:ring-2 hover:ring-zinc-300"
                          aria-label={t.pending_approval_view_image}
                        >
                          <img
                            src={item.imageUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {detail.canJoin || detail.canLeave ? (
            <div className="mt-4">
              {detail.canJoin ? (
                <button
                  type="button"
                  disabled={joining}
                  onClick={onJoin}
                  className="h-12 w-full rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 disabled:bg-zinc-300"
                >
                  {joining ? t.detail_joining : t.detail_join}
                </button>
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
            <ShareButton
              onShare={onShare}
              className="h-11 w-full rounded-xl border border-zinc-200 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            />
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
