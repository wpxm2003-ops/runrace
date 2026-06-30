"use client";

import { LegacyIdRedirect } from "@/app/challenges/_components/LegacyIdRedirect";
import { challengeDetailHref } from "@/lib/challengeRoute";

/** 예전 ?id= 링크 호환 */
export default function LegacyChallengeDetailQueryPage() {
  return <LegacyIdRedirect to={challengeDetailHref} />;
}
