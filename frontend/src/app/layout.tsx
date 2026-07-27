import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "./_components/AppShell";
import { getAppUrl } from "@/lib/appUrl";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const APP_URL = getAppUrl();

const SITE_DESCRIPTION =
  "GPS로 러닝을 기록하고 페이스를 분석하고, 친구·크루와 거리 대결까지. 러닝이 게임이 되는 무료 러닝 앱 RunRace.";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "RunRace — 친구와 함께하는 러닝 기록·대결 앱",
    template: "%s | RunRace",
  },
  description: SITE_DESCRIPTION,
  keywords: ["러닝 앱", "러닝 기록", "페이스 계산기", "러닝 크루", "러닝 대결", "마라톤 훈련"],
  manifest: "/manifest.webmanifest",
  // iOS 홈 화면 추가 시 전체화면(standalone) PWA로 실행
  appleWebApp: {
    capable: true,
    title: "RunRace",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icons/icon-192.webp",
    apple: "/icons/icon-192.webp",
  },
  openGraph: {
    title: "RunRace",
    description: "🏃 RunRace — 기록과 경쟁, 친구와 함께",
    url: APP_URL,
    siteName: "RunRace",
    type: "website",
    images: [{ url: `${APP_URL}/og-image.png`, width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "RunRace",
    description: SITE_DESCRIPTION,
    images: [`${APP_URL}/og-image.png`],
  },
};

/** 구글 리치 결과용 앱 정보(JSON-LD). 콘텐츠와 달리 언어 토글이 없어 대표 언어(ko)로 굽는다. */
const APP_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "RunRace",
  url: APP_URL,
  description: SITE_DESCRIPTION,
  applicationCategory: "HealthApplication",
  operatingSystem: "Android, iOS, Web",
  offers: { "@type": "Offer", price: "0", priceCurrency: "KRW" },
};

export const viewport: Viewport = {
  themeColor: "#18181b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-dvh flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(APP_JSON_LD) }}
        />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
