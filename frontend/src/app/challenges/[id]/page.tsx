import type { Metadata } from "next";
import ChallengeDetailContent from "../_components/ChallengeDetailContent";
import { challengeStaticParamIds, parseChallengeId } from "@/lib/challengeRoute";

export function generateStaticParams() {
  return challengeStaticParamIds();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id: rawId } = await params;
  const id = parseChallengeId(rawId);
  if (!id) return {};

  try {
    // NEXT_PUBLIC_ 변수는 빌드 시 클라이언트 번들에 인라인되므로 서버 전용 API_BASE_URL을 우선 사용
    const serverApiBase =
      process.env.API_BASE_URL ??
      process.env.NEXT_PUBLIC_API_BASE_URL ??
      "http://localhost:8081";
    const res = await fetch(`${serverApiBase}/api/challenges/${id}`, { cache: "force-cache" });
    if (!res.ok) return {};
    const detail = await res.json() as import("@/lib/api/types").ChallengeDetail;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://runrace.co.kr";
    const url = `${appUrl}/challenges/${id}`;
    const title = `${detail.title} | RunRace`;
    const description = `🏃 ${detail.goalKm}km · 👥 ${detail.memberCount}`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        url,
        siteName: "RunRace",
        type: "website",
        images: [{ url: `${appUrl}/og-image.png`, width: 1200, height: 630 }],
      },
    };
  } catch (e) {
    console.error(`[generateMetadata] challenge ${id}:`, e);
    return {};
  }
}

export default function ChallengeDetailPage() {
  return <ChallengeDetailContent />;
}
