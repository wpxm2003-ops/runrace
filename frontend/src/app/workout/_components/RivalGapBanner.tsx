"use client";

import { useLocale } from "@/lib/i18n";
import { formatGapDistance, type DistanceUnit } from "@/lib/units";
import { useGapFlash } from "@/lib/useGapFlash";

type Props = {
  nickname: string;
  /** (이번 핑의 내 누적 거리) - (라이벌의 현재 최선값, m). 양수 = 내가 앞섬. */
  gapM: number;
  unit: DistanceUnit;
};

/**
 * 러닝 중 실시간 라이벌 격차 배너 — GhostGapBanner와 같은 추월/역전 감지·햅틱·색상 로직을
 * useGapFlash로 공유한다(유령은 완주 강조가 추가로 있지만, 실시간 라이벌은 핑 응답에 완주 여부가
 * 없어 부호 반전 강조만 다룬다).
 */
export function RivalGapBanner({ nickname, gapM, unit }: Props) {
  const { t } = useLocale();
  const flash = useGapFlash(gapM);

  const ahead = gapM >= 0;
  const gapLabel = formatGapDistance(Math.abs(gapM), unit);
  const steadyText = ahead ? t.rival_gap_ahead(nickname, gapLabel) : t.rival_gap_behind(nickname, gapLabel);
  const flashText =
    flash === "overtook" ? t.rival_overtook(nickname) : flash === "overtaken" ? t.rival_overtaken(nickname) : null;

  const colorClass =
    flash === "overtaken" || (!flash && !ahead)
      ? "bg-amber-50 text-amber-800"
      : "bg-emerald-50 text-emerald-800";

  return (
    <div className={`rounded-xl px-3 py-2 text-sm font-medium shadow-sm ${colorClass}`}>
      🏃 {flashText ?? steadyText}
    </div>
  );
}
