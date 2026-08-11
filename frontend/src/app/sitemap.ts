import type { MetadataRoute } from "next";
import { getAppUrl } from "@/lib/appUrl";
import { PREFIXED_LOCALES, localizedPath, type SeoPage } from "@/lib/seo";

// output: "export"에서는 메타데이터 라우트도 정적 생성임을 명시해야 한다.
export const dynamic = "force-static";

/** 언어별 페이지가 존재하는 공개 페이지 — 접두사 URL도 함께 싣는다. */
const LOCALIZED: { page: SeoPage; priority: number }[] = [
  { page: "home", priority: 1 },
  { page: "paceCalculator", priority: 0.9 },
  { page: "guides", priority: 0.6 },
  { page: "privacy", priority: 0.2 },
];

/** 한국어만 있는 공개 페이지. */
const KO_ONLY: { path: string; priority: number }[] = [
  { path: "/tools", priority: 0.9 },
  { path: "/tools/treadmill-pace", priority: 0.9 },
  { path: "/training", priority: 0.9 },
  { path: "/guides/app", priority: 0.6 },
  { path: "/guides/ios", priority: 0.6 },
];

/** 검색엔진에 노출할 공개 페이지 목록. 로그인 필수 앱 화면은 넣지 않는다. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = getAppUrl();
  const absolute = (path: string) => (path === "/" ? base : `${base}${path}`);

  return [
    ...LOCALIZED.flatMap(({ page, priority }) => [
      { url: absolute(localizedPath(page, "ko")), priority },
      ...PREFIXED_LOCALES.map((locale) => ({
        url: absolute(localizedPath(page, locale)),
        // 언어별 페이지는 대표 언어보다 약간 낮게 — 같은 값이면 색인 우선순위 신호가 흐려진다.
        priority: Math.max(0.1, priority - 0.1),
      })),
    ]),
    ...KO_ONLY.map(({ path, priority }) => ({ url: absolute(path), priority })),
  ];
}
