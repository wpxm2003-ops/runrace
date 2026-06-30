"use client";

import { parseChallengeId } from "@/lib/challengeRoute";
import { useEffect } from "react";

/**
 * 예전 ?id= 링크 호환 — searchParams의 id를 파싱해 to(id)로 replace, 실패 시 /challenges로.
 * detail/edit 레거시 스텁이 목적지 함수만 다르게 주입해 공유한다.
 */
export function LegacyIdRedirect({ to }: { to: (id: number) => string }) {
  useEffect(() => {
    const id = parseChallengeId(new URLSearchParams(window.location.search).get("id"));
    window.location.replace(id != null ? to(id) : "/challenges");
  }, [to]);

  return (
    <div className="min-h-dvh flex items-center justify-center text-sm text-zinc-600">
      이동 중...
    </div>
  );
}
