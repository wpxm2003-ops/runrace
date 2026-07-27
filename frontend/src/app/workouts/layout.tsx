import type { Metadata } from "next";

/**
 * 운동 상세·공유 페이지는 모든 id가 같은 정적 템플릿이라 검색 색인에서 제외한다.
 * robots.txt로 막지 않는 이유: 카카오·페이스북 스크래퍼가 robots.txt를 따르므로
 * 크롤링 자체를 막으면 공유 링크 미리보기(OG)가 깨진다.
 */
export const metadata: Metadata = {
  robots: { index: false },
};

export default function WorkoutsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
