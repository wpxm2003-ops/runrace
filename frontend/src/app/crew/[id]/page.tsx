import type { Metadata } from "next";
import CrewDetailContent from "../_components/CrewDetailContent";
import { crewStaticParamIds } from "@/lib/crewRoute";
import { getAppUrl } from "@/lib/appUrl";

export function generateStaticParams() {
  return crewStaticParamIds();
}

/**
 * 동적 라우트를 단일 템플릿으로 내보내므로 per-id OG는 정적으로 못 굽는다.
 * 공유 링크 미리보기는 우선 기본 OG로 대체한다(레이스 공유처럼 서버 동적 OG가 필요하면 추후 추가).
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

export default function CrewDetailPage() {
  return <CrewDetailContent />;
}
