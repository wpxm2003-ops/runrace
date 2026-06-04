"use client";

import { PageLayout } from "@/app/_components/PageLayout";
import { Alert } from "@/app/_components/ui/Alert";
import { Card } from "@/app/_components/ui/Card";
import { createInvite, fetchFriends, type Friend } from "@/lib/api";
import { friendAcceptUrl } from "@/lib/friendRoute";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useEffect, useMemo, useState } from "react";

export default function FriendsPage() {
  const { user } = useRequireAuth("/friends");
  const [friends, setFriends] = useState<Friend[]>([]);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inviteLink = useMemo(
    () => (inviteCode ? friendAcceptUrl(inviteCode) : null),
    [inviteCode],
  );

  async function refreshFriends(u = user) {
    if (!u) return;
    setFriends(await fetchFriends(u));
  }

  async function onCreateInvite() {
    if (!user) return;
    setError(null);
    const res = await createInvite(user);
    setInviteCode(res.code);
  }

  useEffect(() => {
    if (user) refreshFriends(user).catch((e) => setError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <PageLayout title="친구">
        {error ? <Alert className="mb-4">{error}</Alert> : null}

        <Card>
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
        </Card>

        <Card className="mt-6">
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
        </Card>
    </PageLayout>
  );
}
