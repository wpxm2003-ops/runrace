"use client";

import type { LatLng } from "@/lib/workoutTrack";
import { useLocale } from "@/lib/i18n";
import dynamic from "next/dynamic";

export type WorkoutMapProps = {
  path: LatLng[];
  position: LatLng | null;
  follow: boolean;
  /** 유령 레이스 — 카카오 지도에서만 렌더링(라이벌·크루 확장 전까지 한국 시장 우선). */
  ghostPath?: LatLng[] | null;
  ghostElapsedMs?: number;
};

const KakaoWorkoutMap = dynamic(() => import("./KakaoWorkoutMap"), { ssr: false });
const LeafletWorkoutMap = dynamic(() => import("./LeafletWorkoutMap"), { ssr: false });

export default function WorkoutMap(props: WorkoutMapProps) {
  const { locale } = useLocale();
  return locale === "ko" ? <KakaoWorkoutMap {...props} /> : <LeafletWorkoutMap {...props} />;
}
