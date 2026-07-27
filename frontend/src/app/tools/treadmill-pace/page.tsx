import type { Metadata } from "next";
import TreadmillPaceContent from "../_components/TreadmillPaceContent";

const TITLE = "트레드밀 속도 변환 — km/h를 페이스(min/km)로";
const DESCRIPTION =
  "트레드밀 속도 km/h를 러닝 페이스 min/km와 mph로 즉시 변환하세요. 5.0~16.0 km/h 환산표와 5km 예상 시간까지 제공하는 무료 계산기.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/tools/treadmill-pace" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/tools/treadmill-pace",
    siteName: "RunRace",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
};

export default function TreadmillPacePage() {
  return <TreadmillPaceContent />;
}
