"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/lib/i18n";
import { formatGapDistance, type DistanceUnit } from "@/lib/units";

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
  const [flash, setFlash] = useState<Flash>(null);
  const prevSignRef = useRef<number | null>(null);
  const prevFinishedRef = useRef(false);

  // 추월/역전 감지 — 부호가 바뀌는 순간 잠깐 강조
  useEffect(() => {
    const sign = gapM === 0 ? 0 : gapM > 0 ? 1 : -1;
    const prevSign = prevSignRef.current;
    if (prevSign != null && prevSign !== 0 && sign !== 0 && prevSign !== sign) {
      setFlash(sign > 0 ? "overtook" : "overtaken");
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(80);
    }
    prevSignRef.current = sign;
  }, [gapM]);

  // 유령 완주(총 소요시간 도달) 순간 1회 강조
  useEffect(() => {
    if (ghostFinished && !prevFinishedRef.current) setFlash("finished");
    prevFinishedRef.current = ghostFinished;
  }, [ghostFinished]);

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), FLASH_MS);
    return () => clearTimeout(id);
  }, [flash]);

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
