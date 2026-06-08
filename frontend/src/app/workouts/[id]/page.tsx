import type { Metadata } from "next";
import { Suspense } from "react";
import WorkoutDetailContent from "../_components/WorkoutDetailContent";
import { workoutStaticParamIds } from "@/lib/workoutRoute";

export function generateStaticParams() {
  return workoutStaticParamIds();
}

export async function generateMetadata(): Promise<Metadata> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://runrace.co.kr";
  return {
    openGraph: {
      title: "RunRace",
      description: "🏃 RunRace — 기록과 경쟁, 친구와 함께",
      siteName: "RunRace",
      type: "website",
      images: [{ url: `${appUrl}/og-image.png`, width: 1200, height: 630 }],
    },
  };
}

export default function WorkoutDetailPage() {
  return (
    <Suspense fallback={null}>
      <WorkoutDetailContent />
    </Suspense>
  );
}
