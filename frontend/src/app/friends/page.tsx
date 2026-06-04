"use client";

import { PageLayout } from "@/app/_components/PageLayout";
import { Alert } from "@/app/_components/ui/Alert";
import { Card } from "@/app/_components/ui/Card";
import { createInvite, fetchFriends, type Friend } from "@/lib/api";
import { friendAcceptUrl } from "@/lib/friendRoute";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useLocale } from "@/lib/i18n";
import { useEffect, useMemo, useState } from "react";

export default function FriendsPage() {
  const { user } = useRequireAuth("/friends");
  const { t } = useLocale();
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
    <PageLayout title={t.friends_title}>
      {error ? <Alert className="mb-4">{error}</Alert> : null}

      <Card>
        <div className="text-lg font-semibold">{t.friends_invite_heading}</div>
        <div className="mt-2 text-sm text-zinc-600">{t.friends_invite_desc}</div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={onCreateInvite}
            className="h-11 rounded-xl bg-zinc-900 px-4 text-white hover:bg-zinc-800"
          >
            {t.friends_invite_btn}
          </button>
          {inviteLink ? (
            <div className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
              <div className="font-medium">{t.friends_invite_link_label}</div>
              <div className="mt-1 break-all">{inviteLink}</div>
            </div>
          ) : null}
        </div>
      </Card>

      <Card className="mt-6">
        <div className="text-lg font-semibold">{t.friends_list_heading}</div>
        <div className="mt-3 grid gap-2">
          {friends.length === 0 ? (
            <div className="text-sm text-zinc-600">{t.friends_empty}</div>
          ) : (
            friends.map((f) => (
              <div
                key={f.id}
                className="flex items-center justify-between rounded-xl border border-zinc-200 px-4 py-3"
              >
                <div>
                  <div className="font-medium">{f.displayName ?? t.no_name}</div>
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
