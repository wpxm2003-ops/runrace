"use client";

import dynamic from "next/dynamic";
import type { LatLng } from "@/lib/workoutTrack";
import { useLocale } from "@/lib/i18n";

function MapLoading() {
  const { t } = useLocale();
  return (
    <div className="flex h-full w-full items-center justify-center bg-zinc-100 text-sm text-zinc-500">
      {t.loading}
    </div>
  );
}

const WorkoutMap = dynamic(() => import("@/app/workout/_components/WorkoutMap"), {
  ssr: false,
  loading: () => <MapLoading />,
});

/**
 * 운동 미디어 카드 — GPS 운동은 경로 지도, 실내러닝은 사진(없으면 플레이스홀더).
 * 운동 상세·기록 패널에서 공통 사용한다.
 */
export function WorkoutMedia({
  isIndoor,
  imageUrl,
  path,
  heightClass,
}: {
  isIndoor: boolean;
  imageUrl: string | null;
  path: LatLng[];
  /** 카드 높이 (예: "h-48 sm:h-64", "h-64 sm:h-80") */
  heightClass: string;
}) {
  const { t } = useLocale();
  const lastPosition = path[path.length - 1] ?? null;
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className={`relative ${heightClass}`}>
        {isIndoor ? (
          imageUrl ? (
            <img src={imageUrl} alt={t.indoor_field_image} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center bg-zinc-50 text-sm text-zinc-400">
              🏃 {t.indoor_badge}
            </div>
          )
        ) : (
          <WorkoutMap path={path} position={lastPosition} follow={false} />
        )}
      </div>
    </div>
  );
}
