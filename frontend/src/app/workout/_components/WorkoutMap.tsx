"use client";

import type { LatLng } from "@/lib/workoutTrack";
import { useLocale } from "@/lib/i18n";
import dynamic from "next/dynamic";

export type WorkoutMapProps = {
  path: LatLng[];
  position: LatLng | null;
  follow: boolean;
};

const KakaoWorkoutMap = dynamic(() => import("./KakaoWorkoutMap"), { ssr: false });
const LeafletWorkoutMap = dynamic(() => import("./LeafletWorkoutMap"), { ssr: false });

export default function WorkoutMap(props: WorkoutMapProps) {
  const { locale } = useLocale();
  return locale === "ko" ? <KakaoWorkoutMap {...props} /> : <LeafletWorkoutMap {...props} />;
}
