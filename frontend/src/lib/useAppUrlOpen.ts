import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { runWhenNavReady } from "@/lib/nativeNav";

/**
 * 네이티브 appUrlOpen(앱 실행 중 수신 링크)과 launch URL(콜드 스타트)을 handler로 전달하는 훅.
 * - 앱 실행 중 들어온 링크는 라우터가 이미 준비된 상태 → 즉시 처리.
 * - 콜드 스타트 launch URL은 launchGuardKey(sessionStorage)로 1회만, 라우터 준비 후 처리
 *   (풀페이지 리로드 루프 방지).
 */
export function useAppUrlOpen(launchGuardKey: string, handler: (url: string) => void): void {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let listener: { remove: () => void } | undefined;

    void import("@capacitor/app").then(({ App }) => {
      // 앱 실행 중 들어온 링크 — 라우터 준비됨 → 즉시 처리
      void App.addListener("appUrlOpen", (event) => {
        handler(event.url);
      }).then((l) => {
        listener = l;
      });

      // 콜드 스타트(앱이 링크로 실행됨) — launch URL은 1회만, 라우터 준비 후 처리
      void App.getLaunchUrl().then((result) => {
        if (!result?.url) return;
        try {
          if (sessionStorage.getItem(launchGuardKey) === result.url) return;
          sessionStorage.setItem(launchGuardKey, result.url);
        } catch {
          /* sessionStorage 불가 시 그대로 진행 */
        }
        runWhenNavReady(() => handler(result.url));
      });
    });

    return () => {
      listener?.remove();
    };
  }, [launchGuardKey, handler]);
}
