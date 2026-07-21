import { StatCard } from "@/app/_components/ui/StatCard";
import type { Translations } from "@/lib/i18n/translations";
import { formatDistance, formatPace, type DistanceUnit } from "@/lib/units";
import { formatDuration } from "@/lib/workoutTrack";

export type WorkoutStatLabels = {
  time: string;
  distance: string;
  pace: string;
  calories: string;
};

/** 번역에서 운동 4-스탯 라벨을 만든다(상세·기록 패널 등 i18n 페이지 공통). */
export function workoutStatLabels(t: Translations): WorkoutStatLabels {
  return {
    time: t.stat_time,
    distance: t.stat_distance,
    pace: t.stat_pace,
    calories: t.stat_calories,
  };
}

/**
 * 운동 4-스탯(시간·거리·페이스·칼로리) 카드 그리드.
 * 운동 상세·기록 패널·공유 페이지에서 공통으로 사용한다.
 * 라벨은 호출부에서 주입한다(i18n 페이지 / 비로그인 공유 페이지 모두 지원).
 */
export function WorkoutStatGrid({
  durationSec,
  distanceM,
  calories,
  labels,
  size = "md",
  columns = 4,
  unit = "km",
}: {
  durationSec: number;
  distanceM: number;
  calories: number;
  labels: WorkoutStatLabels;
  /** md: 운동상세, sm 패널 기본 / lg: 큰 상세 페이지 */
  size?: "md" | "lg";
  /** 4: sm 이상에서 4열 / 2: 항상 2열(좁은 공유 페이지) */
  columns?: 2 | 4;
  /** 거리/페이스 표시 단위. 컨텍스트 없는 공유 페이지는 기본 km. */
  unit?: DistanceUnit;
}) {
  const padding = size === "lg" ? "p-4" : "p-3";
  const valueClassName = size === "lg" ? "text-xl" : "text-lg";
  const gridCols = columns === 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4";

  const cards: [string, string][] = [
    [labels.distance, formatDistance(distanceM, unit)],
    [labels.time, formatDuration(durationSec)],
    [labels.pace, formatPace(distanceM, durationSec, unit)],
    [labels.calories, `${calories} kcal`],
  ];

  return (
    <div className={`grid ${gridCols} gap-3`}>
      {cards.map(([label, value]) => (
        <StatCard
          key={label}
          label={label}
          value={value}
          padding={padding}
          valueClassName={valueClassName}
        />
      ))}
    </div>
  );
}
