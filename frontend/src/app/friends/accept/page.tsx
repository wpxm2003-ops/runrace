"use client";

import { PageLayout } from "@/app/_components/PageLayout";
import { apiFetch } from "@/lib/api";
import { useAuthUser } from "@/lib/useAuthUser";
import { useEffect, useMemo, useState } from "react";

export default function FriendAcceptPage() {
  const { user, loading } = useAuthUser();
  const [status, setStatus] = useState<"idle" | "accepting" | "done" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  const code = useMemo(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("code");
  }, []);

  useEffect(() => {
    if (!code) return;
    if (!loading && !user) {
      window.location.href = `/login`;
      return;
    }
    if (!user) return;

    setStatus("accepting");
    apiFetch<void>(`/api/friends/invites/${code}/accept`, {
      method: "POST",
      user,
    })
      .then(() => setStatus("done"))
      .catch((e) => {
        setError(String(e));
        setStatus("error");
      });
  }, [code, loading, user]);

  return (
    <PageLayout title="친구 초대 수락" maxWidth="max-w-md">
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <p className="text-sm text-zinc-600">
          코드: <span className="font-mono">{code ?? "(없음)"}</span>
        </p>

        <div className="mt-6 rounded-xl bg-zinc-50 p-4 text-sm text-zinc-700">
          {status === "idle" ? "대기 중..." : null}
          {status === "accepting" ? "수락 처리 중..." : null}
          {status === "done" ? "수락 완료! 이제 친구 목록에서 확인하세요." : null}
          {status === "error" ? `실패: ${error ?? ""}` : null}
        </div>

        <a
          href="/friends"
          className="mt-6 block rounded-xl bg-zinc-900 py-3 text-center text-white hover:bg-zinc-800"
        >
          친구로 이동
        </a>
      </div>
    </PageLayout>
  );
}
