"use client";

import type { LatLng } from "@/lib/workoutTrack";
import { useLocale } from "@/lib/i18n";
import dynamic from "next/dynamic";

export type WorkoutMapProps = {
  path: LatLng[];
  position: LatLng | null;
  follow: boolean;
  /** 유령 레이스 — 카카오·Mapbox 지도 모두 동일하게 렌더링한다. */
  ghostPath?: LatLng[] | null;
  ghostElapsedMs?: number;
};

const KakaoWorkoutMap = dynamic(() => import("./KakaoWorkoutMap"), { ssr: false });
const MapboxWorkoutMap = dynamic(() => import("./MapboxWorkoutMap"), { ssr: false });

export default function WorkoutMap(props: WorkoutMapProps) {
  const { locale } = useLocale();
  return locale === "ko" ? <KakaoWorkoutMap {...props} /> : <MapboxWorkoutMap {...props} />;
}
