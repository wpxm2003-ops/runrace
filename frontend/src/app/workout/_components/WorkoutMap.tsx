"use client";

import { isInKorea, type LatLng } from "@/lib/workoutTrack";
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

/**
 * 지도 공급자 선택 — 좌표 우선, 좌표가 없을 때만 언어.
 *
 * 카카오맵은 국외 타일이 없다. 언어로 고르면 해외에서 뛴 한국어 사용자가 빈 지도를 보고,
 * 그 기록은 상세에서도 계속 빈 지도다. 경로 첫 점(없으면 현재 위치)이 한국 밖이면 Mapbox로 보낸다.
 * 둘 다 없는 시작 직전 상태에서만 언어로 추정한다 — 곧 좌표가 들어오면 그 판단으로 대체된다.
 */
function useMapProvider(path: LatLng[], position: LatLng | null) {
  const { locale } = useLocale();
  const reference = path[0] ?? position;
  if (reference) return isInKorea(reference) ? "kakao" : "mapbox";
  return locale === "ko" ? "kakao" : "mapbox";
}

export default function WorkoutMap(props: WorkoutMapProps) {
  const provider = useMapProvider(props.path, props.position);
  return provider === "kakao" ? <KakaoWorkoutMap {...props} /> : <MapboxWorkoutMap {...props} />;
}
