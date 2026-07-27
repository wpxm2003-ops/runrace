import type { MetadataRoute } from "next";
import { getAppUrl } from "@/lib/appUrl";

// output: "export"에서는 메타데이터 라우트도 정적 생성임을 명시해야 한다.
export const dynamic = "force-static";

/** 검색엔진에 노출할 공개 페이지 목록. 로그인 필수 앱 화면은 넣지 않는다. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = getAppUrl();
  return [
    { url: base, priority: 1 },
    { url: `${base}/tools`, priority: 0.9 },
    { url: `${base}/tools/pace-calculator`, priority: 0.9 },
    { url: `${base}/tools/treadmill-pace`, priority: 0.9 },
    { url: `${base}/guides`, priority: 0.6 },
    { url: `${base}/guides/app`, priority: 0.6 },
    { url: `${base}/guides/ios`, priority: 0.6 },
    { url: `${base}/privacy`, priority: 0.2 },
  ];
}
