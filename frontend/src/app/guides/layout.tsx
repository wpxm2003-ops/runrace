import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "이용 가이드",
  description: "RunRace 앱 설치와 사용 방법 안내 — Android 앱, iOS 홈 화면 추가.",
};

export default function GuidesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
