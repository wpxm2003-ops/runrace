"use client";

import { parseChallengeId } from "@/lib/challengeRoute";
import { useEffect } from "react";

/** 예전 ?id= 링크 호환 */
export default function LegacyChallengeEditQueryPage() {
  useEffect(() => {
    const id = parseChallengeId(
      new URLSearchParams(window.location.search).get("id"),
    );
    if (id != null) {
      window.location.replace(`/challenges/${id}/edit`);
      return;
    }
    window.location.replace("/challenges");
  }, []);

  return (
    <div className="min-h-dvh flex items-center justify-center text-sm text-zinc-600">
      이동 중...
    </div>
  );
}
