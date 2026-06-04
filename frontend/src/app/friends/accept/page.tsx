"use client";

import { PageLayout } from "@/app/_components/PageLayout";
import { Card } from "@/app/_components/ui/Card";
import { acceptInvite } from "@/lib/api";
import { redirectToLogin } from "@/lib/auth";
import { readInviteCodeFromQuery } from "@/lib/friendRoute";
import { useAuthUser } from "@/lib/useAuthUser";
import { useEffect, useMemo, useState } from "react";

export default function FriendAcceptPage() {
  const { user, loading } = useAuthUser();
  const [status, setStatus] = useState<"idle" | "accepting" | "done" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  const code = useMemo(() => readInviteCodeFromQuery(), []);

  useEffect(() => {
    if (!code || loading) return;
    if (!user) {
      // 로그인 후 이 수락 URL(?code=...)로 되돌아오도록 현재 경로를 returnTo로 사용
      redirectToLogin();
      return;
    }

    setStatus("accepting");
    acceptInvite(code, user)
      .then(() => setStatus("done"))
      .catch((e) => {
        setError(String(e));
        setStatus("error");
      });
  }, [code, loading, user]);

  return (
    <PageLayout title="친구 초대 수락" maxWidth="max-w-md">
      <Card padding="p-6">
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
      </Card>
    </PageLayout>
  );
}
