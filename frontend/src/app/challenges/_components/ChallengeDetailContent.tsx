"use client";

import { PageLayout } from "@/app/_components/PageLayout";
import { useConfirm } from "@/app/_components/ConfirmProvider";
import { FIXED_ACTION_BOTTOM } from "@/app/_components/AppShell";
import { challengePhaseLabel } from "@/lib/challengePhase";
import { apiFetch, publicFetch } from "@/lib/api";
import { handleAuthFailure, redirectToLogin } from "@/lib/auth";
import {
  challengeEditHref,
  challengeShareUrl,
  parseChallengeId,
} from "@/lib/challengeRoute";
import { useAuthUser } from "@/lib/useAuthUser";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Member = {
  userId: string;
  displayName: string | null;
  totalKm: string;
  remainingKm: string;
  progressPercent: number | string;
  finished: boolean;
};

type Winner = {
  userId: string;
  displayName: string | null;
};

type ChallengeDetail = {
  id: number;
  title: string;
  goalKm: number;
  maxMembers: number;
  startAt: string;
  endAt: string | null;
  creatorUserId: string;
  isMember: boolean;
  isOwner: boolean;
  hasStarted: boolean;
  hasEnded: boolean;
  showManage: boolean;
  canJoin: boolean;
  memberCount: number;
  winner: Winner | null;
  members: Member[];
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString();
}

export default function ChallengeDetailContent() {
  const { user, loading } = useAuthUser();
  const confirm = useConfirm();
  const [detail, setDetail] = useState<ChallengeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const params = useParams();
  const id = useMemo(
    () => parseChallengeId(String(params?.id ?? "")),
    [params?.id],
  );

  async function loadDetail(u = user) {
    if (!id) return;
    const d = await publicFetch<ChallengeDetail>(`/api/challenges/${id}`, u);
    setDetail(d);
  }

  useEffect(() => {
    if (loading) return;
    if (!id) {
      setError("대결 ID가 없습니다.");
      return;
    }
    loadDetail(user).catch((e) => setError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, loading, user]);

  async function onShare() {
    if (!id) return;
    const url = challengeShareUrl(id);
    try {
      await navigator.clipboard.writeText(url);
      setShareMsg("링크가 복사되었습니다.");
    } catch {
      setShareMsg(url);
    }
    setTimeout(() => setShareMsg(null), 2500);
  }

  async function onInvite() {
    await onShare();
  }

  function onEditClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (!user) {
      e.preventDefault();
      redirectToLogin(id ? challengeEditHref(id) : undefined);
    }
  }

  async function onDelete() {
    if (!user || !detail || !id) {
      redirectToLogin(id ? `/challenges/${id}` : undefined);
      return;
    }
    const ok = await confirm({
      title: "방 삭제",
      message: "이 대결 방을 삭제할까요? 삭제 후에는 복구할 수 없습니다.",
      confirmLabel: "삭제",
      destructive: true,
    });
    if (!ok) return;
    setError(null);
    try {
      await apiFetch(`/api/challenges/${id}`, {
        method: "DELETE",
        user,
        returnTo: `/challenges/${id}`,
      });
      window.location.href = "/challenges";
    } catch (e) {
      if (!handleAuthFailure(e, `/challenges/${id}`)) {
        setError(String(e));
      }
    }
  }

  async function onJoin() {
    if (!user || !id) {
      redirectToLogin(`/challenges/${id}`);
      return;
    }
    setJoining(true);
    setError(null);
    try {
      await apiFetch(`/api/challenges/${id}/join`, {
        method: "POST",
        user,
        returnTo: `/challenges/${id}`,
      });
      await loadDetail(user);
    } catch (e) {
      if (!handleAuthFailure(e, `/challenges/${id}`)) {
        setError(String(e));
      }
    } finally {
      setJoining(false);
    }
  }

  const showWinnerBanner =
    detail != null &&
    detail.winner != null &&
    (detail.hasEnded || detail.members.some((m) => m.finished));

  const pageActions = (
    <>
      {detail?.showManage ? (
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="h-9 w-9 rounded-xl border border-zinc-200 bg-white text-lg leading-none"
            aria-label="메뉴"
          >
            ⋯
          </button>
          {menuOpen ? (
            <div className="absolute right-0 z-10 mt-1 w-36 rounded-xl border border-zinc-200 bg-white py-1 shadow-lg">
              <a
                href={id ? challengeEditHref(id) : "#"}
                onClick={onEditClick}
                className="block px-4 py-2 text-sm hover:bg-zinc-50"
              >
                수정
              </a>
              <button
                type="button"
                onClick={onDelete}
                className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-zinc-50"
              >
                삭제
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onInvite();
                }}
                className="block w-full px-4 py-2 text-left text-sm hover:bg-zinc-50"
              >
                초대
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        onClick={onShare}
        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
      >
        공유하기
      </button>
      <a className="text-sm text-zinc-600 hover:underline" href="/challenges">
        목록
      </a>
    </>
  );

  return (
    <PageLayout
      title="대결 상세"
      actions={pageActions}
      className={detail?.canJoin ? "pb-36" : undefined}
    >
        {shareMsg ? (
          <div className="mb-3 rounded-xl bg-emerald-50 p-2 text-sm text-emerald-800">
            {shareMsg}
          </div>
        ) : null}

        {error ? (
          <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {!detail ? (
          <div className="rounded-2xl bg-white p-5 shadow-sm text-sm text-zinc-600">
            로딩 중...
          </div>
        ) : (
          <>
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="text-lg font-semibold">{detail.title}</div>
                <div className="text-xs text-zinc-600">
                  {challengePhaseLabel(detail.startAt, detail.endAt)}
                </div>
              </div>
              <div className="mt-2 text-sm text-zinc-600">
                목표 {detail.goalKm}km · {detail.memberCount}/{detail.maxMembers}명
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                {formatDate(detail.startAt)} ~{" "}
                {detail.endAt ? formatDate(detail.endAt) : "-"}
              </div>
            </div>

            <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
              <div className="text-lg font-semibold">진행 현황</div>
              <div className="mt-4 grid gap-4">
                {detail.members.map((m) => {
                  const pct = Math.min(
                    100,
                    Math.max(0, Number(m.progressPercent) || 0),
                  );
                  return (
                    <div key={m.userId}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">
                          {m.displayName ?? "(이름 없음)"}
                        </span>
                        <span className="text-zinc-600">
                          {m.totalKm} / {detail.goalKm} km
                        </span>
                      </div>
                      <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-zinc-100">
                        <div
                          className="h-full rounded-full bg-zinc-900 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {showWinnerBanner && detail.winner ? (
              <div className="mt-6 rounded-2xl bg-amber-50 p-5 text-center shadow-sm">
                <div className="text-lg font-semibold text-amber-900">
                  Winner
                </div>
                <div className="mt-2 text-amber-800">
                  {detail.winner.displayName ?? "우승자"}님, 축하합니다!
                </div>
              </div>
            ) : null}

            {detail.canJoin ? (
              <div
                className="fixed left-0 right-0 z-40 border-t border-zinc-200 bg-white/95 px-6 pb-3 pt-4 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur"
                style={{ bottom: FIXED_ACTION_BOTTOM }}
              >
                <div className="mx-auto max-w-2xl">
                  <button
                    type="button"
                    disabled={joining}
                    onClick={onJoin}
                    className="h-12 w-full rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 disabled:bg-zinc-300"
                  >
                    {joining ? "참여 중..." : "참여하기"}
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
    </PageLayout>
  );
}
