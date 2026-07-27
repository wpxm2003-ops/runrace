import type { Metadata } from "next";

/** 챌린지 화면은 로그인 필수 앱 화면이라 색인 제외(공유 미리보기 유지를 위해 크롤링은 허용). */
export const metadata: Metadata = {
  robots: { index: false },
};

export default function ChallengesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
