"use client";

import { PageLayout } from "@/app/_components/PageLayout";
import { publicFetch } from "@/lib/api";
import { redirectToLogin } from "@/lib/auth";
import { challengeDetailHref } from "@/lib/challengeRoute";
import { challengePhaseFromApi, challengePhaseLabel } from "@/lib/challengePhase";
import { useAuthUser } from "@/lib/useAuthUser";
import { useEffect, useState } from "react";

type ChallengeItem = {
  id: number;
  title: string;
  goalKm: number;
  phase: string;
  startAt: string;
  endAt: string | null;
  memberCount: number;
  createdAt: string;
  isOwner: boolean;
};

function formatDateRange(startAt: string, endAt: string | null) {
  const start = new Date(startAt).toLocaleDateString();
  const end = endAt ? new Date(endAt).toLocaleDateString() : "-";
  return `${start} ~ ${end}`;
}

export default function ChallengesPage() {
  const { user, loading } = useAuthUser();
  const [challenges, setChallenges] = useState<ChallengeItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);

  async function refreshAll(u = user) {
    setListLoading(true);
    try {
      const c = await publicFetch<ChallengeItem[]>("/api/challenges", u);
      setChallenges(c);
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    if (loading) return;
    refreshAll(user).catch((e) => setError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user]);

  function onCreateClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (!user) {
      e.preventDefault();
      redirectToLogin("/challenges/create");
    }
  }

  return (
    <PageLayout
      title="대결"
      actions={
        <a
          href="/challenges/create"
          onClick={onCreateClick}
          className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          방만들기
        </a>
      }
    >
      {error ? (
        <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="text-lg font-semibold">대결 목록</div>
        <div className="mt-3 grid gap-2">
          {listLoading ? (
            <div className="text-sm text-zinc-600">로딩 중...</div>
          ) : challenges.length === 0 ? (
            <div className="text-sm text-zinc-600">
              대결이 없습니다. 방만들기로 새 대결을 시작해 보세요.
            </div>
          ) : (
            challenges.map((c) => (
              <a
                key={c.id}
                href={challengeDetailHref(c.id)}
                className="block rounded-xl border border-zinc-200 px-4 py-3 hover:bg-zinc-50"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">{c.title}</div>
                  <div className="text-xs text-zinc-600">
                    {challengePhaseFromApi(c.phase) ??
                      challengePhaseLabel(c.startAt, c.endAt)}
                  </div>
                </div>
                <div className="mt-1 text-sm text-zinc-600">
                  목표 {c.goalKm}km · {c.memberCount}명 참여
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  {formatDateRange(c.startAt, c.endAt)}
                </div>
              </a>
            ))
          )}
        </div>
      </div>
    </PageLayout>
  );
}
