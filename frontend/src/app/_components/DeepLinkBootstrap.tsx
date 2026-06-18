"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { processIncomingDeepLink } from "@/lib/deepLink";

/**
 * App Links(https://runrace.co.kr/...)로 앱에 들어온 외부 링크를 SPA 경로로 이동.
 * 카카오톡 공유 링크 등을 설치된 앱에서 바로 연다.
 */
export function DeepLinkBootstrap() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let listener: { remove: () => void } | undefined;

    void import("@capacitor/app").then(({ App }) => {
      void App.addListener("appUrlOpen", (event) => {
        processIncomingDeepLink(event.url);
      }).then((l) => {
        listener = l;
      });

      // 콜드 스타트(앱이 링크로 실행됨) 처리
      void App.getLaunchUrl().then((result) => {
        if (result?.url) processIncomingDeepLink(result.url);
      });
    });

    return () => {
      listener?.remove();
    };
  }, []);

  return null;
}
