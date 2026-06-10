import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "RunRace",
  description: "🏃 RunRace — 기록과 경쟁, 친구와 함께",
  openGraph: {
    title: "RunRace",
    description: "🏃 RunRace — 기록과 경쟁, 친구와 함께",
    url: APP_URL,
    siteName: "RunRace",
    type: "website",
    images: [{ url: `${APP_URL}/og-image.png`, width: 1200, height: 630 }],
  },
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
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
