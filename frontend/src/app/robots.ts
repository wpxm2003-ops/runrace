import type { MetadataRoute } from "next";
import { getAppUrl } from "@/lib/appUrl";

// output: "export"에서는 메타데이터 라우트도 정적 생성임을 명시해야 한다.
export const dynamic = "force-static";

/**
 * 크롤링 정책. 로그인 필수 앱 화면은 검색 크롤링에서 제외한다.
 * /workouts·/challenges·/crew 공유 딥링크는 카카오·페이스북 스크래퍼가 robots.txt를
 * 따르므로 여기서 막지 않고(미리보기 유지), 각 세그먼트 layout의 noindex로 색인만 막는다.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/my",
        "/records",
        "/workout$",
        "/workout/",
        "/rivals",
        "/shoes",
        "/login",
        "/kakao/",
        "/feedback",
        "/sb",
      ],
    },
    sitemap: `${getAppUrl()}/sitemap.xml`,
  };
}
