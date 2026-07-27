import type { Metadata } from "next";

const TITLE = "NSM 코치 — 노르웨이식 훈련 페이스·주간 스케줄 계산기";
const DESCRIPTION =
  "최근 5K·10K·하프 기록으로 역치 페이스를 계산하고, 노르웨이식(NSM) Sub-T 인터벌 주간 훈련 스케줄을 자동으로 만들어 드려요. 로그인 없이 무료로 사용하세요.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/training" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/training",
    siteName: "RunRace",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
};

export default function TrainingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
