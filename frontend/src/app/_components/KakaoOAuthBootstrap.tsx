"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { processKakaoOAuthReturn } from "@/lib/kakaoAuth";
import { isNativeNavReady } from "@/lib/nativeNav";

/** 콜드 스타트에서 같은 launch URL 재처리 방지(풀페이지 리로드 루프 방지). */
const LAUNCH_KEY = "rr_kakao_launch_handled";

function runWhenNavReady(fn: () => void, attempts = 60): void {
  if (isNativeNavReady() || attempts <= 0) {
    fn();
    return;
  }
  setTimeout(() => runWhenNavReady(fn, attempts - 1), 50);
}

/** 네이티브 앱 OAuth 콜백(com.runrace.app://kakao/callback) 수신 */
export function KakaoOAuthBootstrap() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let listener: { remove: () => void } | undefined;

    void import("@capacitor/app").then(({ App }) => {
      void App.addListener("appUrlOpen", (event) => {
        void processKakaoOAuthReturn(event.url);
      }).then((l) => {
        listener = l;
      });

      void App.getLaunchUrl().then((result) => {
        if (!result?.url) return;
        try {
          if (sessionStorage.getItem(LAUNCH_KEY) === result.url) return;
          sessionStorage.setItem(LAUNCH_KEY, result.url);
        } catch {
          /* 무시 */
        }
        runWhenNavReady(() => void processKakaoOAuthReturn(result.url));
      });
    });

    return () => {
      listener?.remove();
    };
  }, []);

  return null;
}
