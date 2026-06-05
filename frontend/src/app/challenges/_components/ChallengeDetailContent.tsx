"use client";

import { PageLayout } from "@/app/_components/PageLayout";
import { useConfirm } from "@/app/_components/ConfirmProvider";
import { FIXED_ACTION_BOTTOM } from "@/app/_components/AppShell";
import { Alert } from "@/app/_components/ui/Alert";
import { Card } from "@/app/_components/ui/Card";
import { Skeleton } from "@/app/_components/ui/Skeleton";
import {
  deleteChallenge,
  joinChallenge,
  leaveChallenge,
  useChallengeDetail,
} from "@/lib/api";
import { ChallengePhaseBadge } from "@/app/_components/ChallengePhaseBadge";
import { handleAuthFailure, redirectToLogin } from "@/lib/auth";
import { challengeEditHref, parseChallengeId } from "@/lib/challengeRoute";
import { ChallengeMemberWorkouts } from "@/app/challenges/_components/ChallengeMemberWorkouts";
import { ShareButton } from "@/app/_components/ShareButton";
import { buildRaceCard, shareImageBlob } from "@/lib/shareCard";
import { formatDateRange } from "@/lib/format";
import { useAuthUser } from "@/lib/useAuthUser";
import { nativeNavigate } from "@/lib/nativeNav";
import { useLocale } from "@/lib/i18n";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";

export default function ChallengeDetailContent() {
  const { user, loading: authLoading } = useAuthUser();
  const confirm = useConfirm();
  const { t } = useLocale();
  const [actionError, setActionError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);

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

  const showWinnerBanner =
    detail != null && detail.winner != null &&
    (detail.hasEnded || detail.members.some((m) => m.finished));

  async function onShare() {
    if (!detail) return;
    const blob = await buildRaceCard({
      title: detail.title,
      goalKm: detail.goalKm,
      members: detail.members.map((m) => ({
        nickname: m.nickname,
        totalKm: m.totalKm,
        progressPercent: Number(m.progressPercent) || 0,
      })),
      winnerNickname: detail.winner?.nickname,
      dateLabel: formatDateRange(detail.startAt, detail.endAt),
    });
    await shareImageBlob(blob, `runrace-race-${id}.png`, `RunRace · ${detail.title}`);
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
      {detail ? <ShareButton onShare={onShare} /> : null}
      <a className="text-sm text-zinc-600 hover:underline" href="/challenges">{t.detail_list_link}</a>
    </>
  );

  return (
    <PageLayout
      title={t.detail_title}
      actions={pageActions}
      className={detail?.canJoin || detail?.canLeave ? "pb-36" : undefined}
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
              목표 {detail.goalKm}km · {detail.memberCount}/{detail.maxMembers}명
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              {formatDateRange(detail.startAt, detail.endAt)}
            </div>
          </Card>

          <Card className="mt-6">
            <div className="text-lg font-semibold">{t.detail_progress}</div>
            <div className="mt-4 grid gap-4">
              {detail.members.map((m) => {
                const pct = Math.min(100, Math.max(0, Number(m.progressPercent) || 0));
                return (
                  <div key={m.userId}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{m.nickname ?? t.no_name}</span>
                      <span className="text-zinc-600">{m.totalKm} / {detail.goalKm} km</span>
                    </div>
                    <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-zinc-100">
                      <div className="h-full rounded-full bg-zinc-900 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {showWinnerBanner && detail.winner ? (
            <div className="mt-6 rounded-2xl bg-amber-50 p-5 text-center shadow-sm">
              <div className="text-lg font-semibold text-amber-900">{t.detail_winner_label}</div>
              <div className="mt-2 text-amber-800">
                {t.detail_winner_message(detail.winner.nickname ?? t.no_name)}
              </div>
            </div>
          ) : null}

          {id != null ? (
            <ChallengeMemberWorkouts
              challengeId={id}
              isMember={detail.isMember}
              user={user}
            />
          ) : null}

          {detail.canJoin || detail.canLeave ? (
            <div
              className="fixed left-0 right-0 z-40 border-t border-zinc-200 bg-white/95 px-6 pb-3 pt-4 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur"
              style={{ bottom: FIXED_ACTION_BOTTOM }}
            >
              <div className="mx-auto max-w-2xl">
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
            </div>
          ) : null}
        </>
      )}
    </PageLayout>
  );
}
