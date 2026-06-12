import { useEffect, useRef } from "react";

/**
 * active인 동안 화면이 꺼지지 않게 유지한다(러닝 중 포그라운드 GPS 유지용).
 * - Screen Wake Lock API 지원 시에만 동작(iOS 16.4+/안드 크롬 등). 미지원·차단 시 조용히 무시.
 * - 탭이 숨겨지면 락이 자동 해제되므로, 다시 보일 때 재획득한다.
 */
export function useWakeLock(active: boolean) {
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    async function acquire() {
      if (!("wakeLock" in navigator)) return;
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          void lock.release();
          return;
        }
        lockRef.current = lock;
        lock.addEventListener("release", () => {
          lockRef.current = null;
        });
      } catch {
        // 사용자 제스처 없음·배터리 절약 모드·미지원 등 — 무시
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible" && !lockRef.current) {
        void acquire();
      }
    }

    void acquire();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void lockRef.current?.release().catch(() => {});
      lockRef.current = null;
    };
  }, [active]);
}
