import type { Metadata } from "next";
import PaceCalculatorContent from "../_components/PaceCalculatorContent";

const TITLE = "러닝 페이스 계산기 — 5K·10K·하프·풀코스 목표 페이스";
const DESCRIPTION =
  "목표 완주 시간을 페이스로, 페이스를 완주 시간으로 바로 변환하세요. 구간 통과 시간과 페이스별 완주 시간표까지 제공하는 무료 러닝 페이스 계산기.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/tools/pace-calculator" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/tools/pace-calculator",
    siteName: "RunRace",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
};

export default function PaceCalculatorPage() {
  return <PaceCalculatorContent />;
}
