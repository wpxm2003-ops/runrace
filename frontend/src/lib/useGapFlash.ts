"use client";

import { useEffect, useRef, useState } from "react";

export type GapFlash = "overtook" | "overtaken" | null;

/**
 * 격차(gapM)의 부호(양수=앞섬/음수=뒤처짐)가 바뀌는 순간을 감지해 잠깐 강조하고 진동한다.
 * GhostGapBanner(유령 레이스)와 RivalGapBanner(실시간 라이벌)가 이 판정 로직을 공유한다.
 */
export function useGapFlash(gapM: number, flashMs = 2_500): GapFlash {
  const [flash, setFlash] = useState<GapFlash>(null);
  const prevSignRef = useRef<number | null>(null);

  useEffect(() => {
    const sign = gapM === 0 ? 0 : gapM > 0 ? 1 : -1;
    const prevSign = prevSignRef.current;
    if (prevSign != null && prevSign !== 0 && sign !== 0 && prevSign !== sign) {
      setFlash(sign > 0 ? "overtook" : "overtaken");
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(80);
    }
    prevSignRef.current = sign;
  }, [gapM]);

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), flashMs);
    return () => clearTimeout(id);
  }, [flash, flashMs]);

  return flash;
}
