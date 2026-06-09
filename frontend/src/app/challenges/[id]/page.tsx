import type { Metadata } from "next";
import ChallengeDetailContent from "../_components/ChallengeDetailContent";
import { challengeStaticParamIds, parseChallengeId } from "@/lib/challengeRoute";
import { resolveServerApiBaseUrl } from "@/lib/serverApiBase";

export function generateStaticParams() {
  return challengeStaticParamIds();
}

/**
 * 빌드 중 백엔드가 닿지 않으면(로컬에서 백엔드 없이 export 등) 첫 실패 후
 * 나머지 프리렌더의 fetch를 건너뛴다 — ECONNREFUSED 로그 폭발 방지.
 */
let backendUnreachable = false;

function isConnectionRefused(e: unknown): boolean {
  const cause = (e as { cause?: { code?: string; errors?: Array<{ code?: string }> } })?.cause;
  if (!cause) return false;
  if (cause.code === "ECONNREFUSED") return true;
  return Array.isArray(cause.errors) && cause.errors.some((err) => err?.code === "ECONNREFUSED");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id: rawId } = await params;
  const id = parseChallengeId(rawId);
  if (!id) return {};
  if (backendUnreachable) return {};

  try {
    const serverApiBase = resolveServerApiBaseUrl();
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
    if (isConnectionRefused(e)) {
      if (!backendUnreachable) {
        backendUnreachable = true;
        console.warn(
          `[generateMetadata] 챌린지 OG 메타데이터 생성을 위해 백엔드(${resolveServerApiBaseUrl()})가 필요합니다. ` +
            `연결되지 않아 이번 빌드의 챌린지 OG 태그는 비워집니다 — 백엔드를 띄운 뒤 빌드하면 정상 생성됩니다.`,
        );
      }
      return {};
    }
    console.error(`[generateMetadata] challenge ${id}:`, e);
    return {};
  }
}

export default function ChallengeDetailPage() {
  return <ChallengeDetailContent />;
}
