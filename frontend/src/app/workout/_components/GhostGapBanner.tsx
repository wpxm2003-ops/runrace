"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/lib/i18n";
import { formatGapDistance, type DistanceUnit } from "@/lib/units";
import { useGapFlash } from "@/lib/useGapFlash";

type Flash = "overtook" | "overtaken" | "finished" | null;

type Props = {
  /** 내 거리 - 유령 거리(m). 양수 = 내가 앞섬. */
  gapM: number;
  ghostFinished: boolean;
  unit: DistanceUnit;
};

const FLASH_MS = 2_500;

export function GhostGapBanner({ gapM, ghostFinished, unit }: Props) {
  const { t } = useLocale();
  // 추월/역전 감지(부호 반전)는 RivalGapBanner와 공유하는 훅이 담당한다.
  const gapFlash = useGapFlash(gapM, FLASH_MS);
  const [finishedFlash, setFinishedFlash] = useState(false);
  const prevFinishedRef = useRef(false);

  // 유령 완주(총 소요시간 도달) 순간 1회 강조 — finished는 추월/역전과 달리 gapM 부호와 무관해 별도 트리거.
  useEffect(() => {
    if (ghostFinished && !prevFinishedRef.current) setFinishedFlash(true);
    prevFinishedRef.current = ghostFinished;
  }, [ghostFinished]);

  useEffect(() => {
    if (!finishedFlash) return;
    const id = setTimeout(() => setFinishedFlash(false), FLASH_MS);
    return () => clearTimeout(id);
  }, [finishedFlash]);

  const flash: Flash = finishedFlash ? "finished" : gapFlash;
  const ahead = gapM >= 0;
  const gapLabel = formatGapDistance(Math.abs(gapM), unit);
  const steadyText = ahead ? t.ghost_gap_ahead(gapLabel) : t.ghost_gap_behind(gapLabel);
  const flashText =
    flash === "overtook"
      ? t.ghost_overtook
      : flash === "overtaken"
        ? t.ghost_overtaken
        : flash === "finished"
          ? t.ghost_finished
          : null;

  const colorClass =
    flash === "finished"
      ? "bg-violet-50 text-violet-800"
      : flash === "overtaken" || (!flash && !ahead)
        ? "bg-amber-50 text-amber-800"
        : "bg-emerald-50 text-emerald-800";

  return (
    <div className={`rounded-xl px-3 py-2 text-sm font-medium shadow-sm ${colorClass}`}>
      👻 {flashText ?? steadyText}
    </div>
  );
}
