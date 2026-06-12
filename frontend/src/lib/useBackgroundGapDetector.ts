import { useCallback, useEffect, useRef, useState } from "react";

/** 이 시간(초) 이상 숨겨졌을 때만 끊김으로 본다(알림 글랜스 등 짧은 전환은 무시). */
const MIN_GAP_SEC = 3;

/**
 * 러닝 중 앱이 백그라운드로 전환됐다 돌아온 구간을 감지한다.
 * iOS 웹/PWA는 백그라운드에서 GPS 추적이 멈추므로, 복귀 시 끊긴 시간을 알려 주기 위함.
 * 반환: gapSec(끊긴 초, 없으면 null), dismiss(배너 닫기).
 */
export function useBackgroundGapDetector(active: boolean) {
  const [gapSec, setGapSec] = useState<number | null>(null);
  const hiddenAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      hiddenAtRef.current = null;
      return;
    }
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
      } else if (hiddenAtRef.current != null) {
        const sec = Math.round((Date.now() - hiddenAtRef.current) / 1000);
        hiddenAtRef.current = null;
        if (sec >= MIN_GAP_SEC) setGapSec(sec);
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [active]);

  const dismiss = useCallback(() => setGapSec(null), []);
  return { gapSec, dismiss };
}
