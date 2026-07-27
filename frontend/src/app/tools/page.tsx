import type { Metadata } from "next";
import ToolsIndexContent from "./_components/ToolsIndexContent";

const TITLE = "러닝 계산기 — 페이스 계산·트레드밀 속도 변환";
const DESCRIPTION =
  "로그인 없이 쓰는 무료 러닝 계산기 모음. 페이스 계산기, 트레드밀 속도-페이스(min/km) 환산표를 제공해요.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/tools" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/tools",
    siteName: "RunRace",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
};

export default function ToolsPage() {
  return <ToolsIndexContent />;
}
