"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { processIncomingDeepLink } from "@/lib/deepLink";
import { isNativeNavReady } from "@/lib/nativeNav";

/** 콜드 스타트에서 같은 launch URL을 재처리하지 않도록 표시(풀페이지 리로드 루프 방지). */
const LAUNCH_KEY = "rr_launch_handled";

/** SPA 라우터가 준비되면 fn 실행 — 준비 전 풀페이지 리로드(.html→index) 루프를 막는다. */
function runWhenNavReady(fn: () => void, attempts = 60): void {
  if (isNativeNavReady() || attempts <= 0) {
    fn();
    return;
  }
  setTimeout(() => runWhenNavReady(fn, attempts - 1), 50);
}

/**
 * App Links(https://runrace.co.kr/...)로 앱에 들어온 외부 링크를 SPA 경로로 이동.
 * 카카오톡 공유 링크 등을 설치된 앱에서 바로 연다.
 */
export function DeepLinkBootstrap() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let listener: { remove: () => void } | undefined;

    void import("@capacitor/app").then(({ App }) => {
      // 앱 실행 중 들어온 링크 — 라우터 준비됨 → 즉시 SPA 이동
      void App.addListener("appUrlOpen", (event) => {
        processIncomingDeepLink(event.url);
      }).then((l) => {
        listener = l;
      });

      // 콜드 스타트(앱이 링크로 실행됨) — launch URL은 1회만, 라우터 준비 후 이동
      void App.getLaunchUrl().then((result) => {
        if (!result?.url) return;
        try {
          if (sessionStorage.getItem(LAUNCH_KEY) === result.url) return;
          sessionStorage.setItem(LAUNCH_KEY, result.url);
        } catch {
          /* sessionStorage 불가 시 그대로 진행 */
        }
        runWhenNavReady(() => processIncomingDeepLink(result.url));
      });
    });

    return () => {
      listener?.remove();
    };
  }, []);

  return null;
}
