"use client";

import { PageLayout } from "@/app/_components/PageLayout";
import { apiFetch } from "@/lib/api";
import { useAuthUser } from "@/lib/useAuthUser";
import { useEffect, useMemo, useState } from "react";

type Friend = {
  id: string;
  displayName: string | null;
  photoUrl: string | null;
  email: string | null;
};

export default function FriendsPage() {
  const { user, loading } = useAuthUser();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inviteLink = useMemo(() => {
    if (!inviteCode) return null;
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/friends/accept?code=${inviteCode}`;
  }, [inviteCode]);

  async function refreshFriends(u = user) {
    if (!u) return;
    const list = await apiFetch<Friend[]>("/api/friends", { user: u });
    setFriends(list);
  }

  async function onCreateInvite() {
    if (!user) return;
    setError(null);
    const res = await apiFetch<{ code: string; expiresAt: string }>(
      "/api/friends/invites",
      { method: "POST", user },
    );
    setInviteCode(res.code);
  }

  useEffect(() => {
    if (!loading && !user) {
      window.location.href = "/login";
      return;
    }
    if (user) refreshFriends(user).catch((e) => setError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user]);

  return (
    <PageLayout title="친구">
        {error ? (
          <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="text-lg font-semibold">친구 초대</div>
          <div className="mt-2 text-sm text-zinc-600">
            초대 링크를 만들어 친구에게 공유하세요.
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={onCreateInvite}
              className="h-11 rounded-xl bg-zinc-900 px-4 text-white hover:bg-zinc-800"
            >
              초대 링크 생성
            </button>
            {inviteLink ? (
              <div className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
                <div className="font-medium">초대 링크</div>
                <div className="mt-1 break-all">{inviteLink}</div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
          <div className="text-lg font-semibold">친구 목록</div>
          <div className="mt-3 grid gap-2">
            {friends.length === 0 ? (
              <div className="text-sm text-zinc-600">아직 친구가 없습니다.</div>
            ) : (
              friends.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between rounded-xl border border-zinc-200 px-4 py-3"
                >
                  <div>
                    <div className="font-medium">
                      {f.displayName ?? "(이름 없음)"}
                    </div>
                    <div className="text-xs text-zinc-500">{f.email ?? ""}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
    </PageLayout>
  );
}

