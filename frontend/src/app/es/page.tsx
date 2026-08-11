// 언어별 공개 페이지 — 정적 내보내기라 요청 시점 언어 분기가 불가능해, 언어마다 URL을 굽는다.
// 라우트를 명시적으로 두는 이유: 루트에 [locale] 동적 세그먼트를 쓰면 /records 같은 기존 경로와
// 매칭이 모호해지고, 린트의 내부 링크 검사도 모든 경로를 이 세그먼트로 오인한다.
import type { Metadata } from "next";
import HomeContent from "@/app/page";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("home", "es");

export default function Page() {
  return <HomeContent />;
}
