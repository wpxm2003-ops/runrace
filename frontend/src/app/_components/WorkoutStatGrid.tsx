import { formatKm } from "@/lib/format";
import { formatDuration, formatPaceMinPerKm } from "@/lib/workoutTrack";

export type WorkoutStatLabels = {
  time: string;
  distance: string;
  pace: string;
  calories: string;
};

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
}: {
  durationSec: number;
  distanceM: number;
  calories: number;
  labels: WorkoutStatLabels;
  /** md: 운동상세, sm 패널 기본 / lg: 큰 상세 페이지 */
  size?: "md" | "lg";
  /** 4: sm 이상에서 4열 / 2: 항상 2열(좁은 공유 페이지) */
  columns?: 2 | 4;
}) {
  const pad = size === "lg" ? "p-4" : "p-3";
  const valueText = size === "lg" ? "text-xl" : "text-lg";
  const gridCols = columns === 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4";

  const cards: [string, string][] = [
    [labels.time, formatDuration(durationSec)],
    [labels.distance, formatKm(distanceM)],
    [labels.pace, formatPaceMinPerKm(distanceM, durationSec)],
    [labels.calories, `${calories} kcal`],
  ];

  return (
    <div className={`grid ${gridCols} gap-3`}>
      {cards.map(([label, value]) => (
        <div
          key={label}
          className={`rounded-2xl border border-zinc-200 bg-white ${pad} shadow-sm`}
        >
          <div className="text-xs text-zinc-500">{label}</div>
          <div className={`mt-1 ${valueText} font-semibold tabular-nums`}>{value}</div>
        </div>
      ))}
    </div>
  );
}
