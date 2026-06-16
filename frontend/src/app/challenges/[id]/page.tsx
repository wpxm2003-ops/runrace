import type { Metadata } from "next";
import ChallengeDetailContent from "../_components/ChallengeDetailContent";
import { challengeStaticParamIds } from "@/lib/challengeRoute";
import { getAppUrl } from "@/lib/appUrl";

export function generateStaticParams() {
  return challengeStaticParamIds();
}

/**
 * 동적 라우트를 단일 템플릿으로 내보내므로 per-id OG는 정적으로 못 굽는다.
 * 공유 링크 미리보기 OG는 백엔드 /api/share/challenges/{id}가 모든 id에 대해 동적 생성한다.
 */
export function generateMetadata(): Metadata {
  const appUrl = getAppUrl();
  return {
    openGraph: {
      title: "RunRace",
      description: "🏃 RunRace — 기록과 경쟁, 친구와 함께",
      siteName: "RunRace",
      type: "website",
      images: [{ url: `${appUrl}/og-image.png`, width: 1200, height: 630 }],
    },
  };
}

export default function ChallengeDetailPage() {
  return <ChallengeDetailContent />;
}
