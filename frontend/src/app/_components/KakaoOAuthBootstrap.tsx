"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { processKakaoOAuthReturn } from "@/lib/kakaoAuth";

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
        if (result?.url) void processKakaoOAuthReturn(result.url);
      });
    });

    return () => {
      listener?.remove();
    };
  }, []);

  return null;
}
