"use client";

import { LegacyIdRedirect } from "@/app/challenges/_components/LegacyIdRedirect";
import { challengeEditHref } from "@/lib/challengeRoute";

/** 예전 ?id= 링크 호환 */
export default function LegacyChallengeEditQueryPage() {
  return <LegacyIdRedirect to={challengeEditHref} />;
}
