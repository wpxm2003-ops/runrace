"use client";

import { PageLayout } from "@/app/_components/PageLayout";
import { Alert } from "@/app/_components/ui/Alert";
import { Card } from "@/app/_components/ui/Card";
import { Skeleton } from "@/app/_components/ui/Skeleton";
import { createInvite, useFriendList } from "@/lib/api";
import { friendAcceptUrl } from "@/lib/friendRoute";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useLocale } from "@/lib/i18n";
import { useMemo, useState } from "react";

export default function FriendsPage() {
  const { user } = useRequireAuth("/friends");
  const { t } = useLocale();
  const { data: friends = [], isLoading, error, mutate } = useFriendList(user);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const inviteLink = useMemo(
    () => (inviteCode ? friendAcceptUrl(inviteCode) : null),
    [inviteCode],
  );

  async function onCreateInvite() {
    if (!user) return;
    setInviteError(null);
    try {
      const res = await createInvite(user);
      setInviteCode(res.code);
    } catch (e) {
      setInviteError(String(e));
    }
  }

  return (
    <PageLayout title={t.friends_title}>
      {(error || inviteError) ? (
        <Alert className="mb-4">{String(error ?? inviteError)}</Alert>
      ) : null}

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
          {isLoading && friends.length === 0 ? (
            <>
              <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="mt-1.5 h-3 w-48" />
              </div>
              <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="mt-1.5 h-3 w-40" />
              </div>
            </>
          ) : friends.length === 0 ? (
            <div className="text-sm text-zinc-600">{t.friends_empty}</div>
          ) : (
            friends.map((f) => (
              <div key={f.id} className="flex items-center justify-between rounded-xl border border-zinc-200 px-4 py-3">
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
