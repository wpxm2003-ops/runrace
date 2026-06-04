"use client";

import { PageLayout } from "@/app/_components/PageLayout";
import { Card } from "@/app/_components/ui/Card";
import { acceptInvite } from "@/lib/api";
import { redirectToLogin } from "@/lib/auth";
import { readInviteCodeFromQuery } from "@/lib/friendRoute";
import { useAuthUser } from "@/lib/useAuthUser";
import { useLocale } from "@/lib/i18n";
import { useEffect, useMemo, useState } from "react";

export default function FriendAcceptPage() {
  const { user, loading } = useAuthUser();
  const { t } = useLocale();
  const [status, setStatus] = useState<"idle" | "accepting" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const code = useMemo(() => readInviteCodeFromQuery(), []);

  useEffect(() => {
    if (!code || loading) return;
    if (!user) { redirectToLogin(); return; }
    setStatus("accepting");
    acceptInvite(code, user)
      .then(() => setStatus("done"))
      .catch((e) => { setError(String(e)); setStatus("error"); });
  }, [code, loading, user]);

  return (
    <PageLayout title={t.accept_title} maxWidth="max-w-md">
      <Card padding="p-6">
        <p className="text-sm text-zinc-600">
          {t.accept_code_label} <span className="font-mono">{code ?? t.accept_code_none}</span>
        </p>
        <div className="mt-6 rounded-xl bg-zinc-50 p-4 text-sm text-zinc-700">
          {status === "idle" ? t.accept_idle : null}
          {status === "accepting" ? t.accept_accepting : null}
          {status === "done" ? t.accept_done : null}
          {status === "error" ? t.accept_error(error ?? "") : null}
        </div>
        <a
          href="/friends"
          className="mt-6 block rounded-xl bg-zinc-900 py-3 text-center text-white hover:bg-zinc-800"
        >
          {t.accept_go_friends}
        </a>
      </Card>
    </PageLayout>
  );
}
