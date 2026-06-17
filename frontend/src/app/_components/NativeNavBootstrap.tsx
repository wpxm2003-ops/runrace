"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { useNavProgress } from "@/app/_components/NavProgressProvider";
import { handleNativeBack, nativeNavigate, persistNavStack, registerBack, registerPush, registerReplace } from "@/lib/nativeNav";
import { persistPageState } from "@/lib/pageStateStore";

/**
 * Next.js router.push를 전역에 등록해 SPA 전환을 활성화한다.
 * - 웹/APK 모두 <a href> 클릭을 router.push로 처리 → 풀페이지 리로드 없음
 * - nativeNavigate() 호출도 router.push를 사용한다
 * - 네이티브: Android 하드웨어 뒤로가기 → SPA 이전 화면
 */
export function NativeNavBootstrap() {
  const router = useRouter();
  const { beginNavigation } = useNavProgress();

  useEffect(() => {
    if ("scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }

    registerPush((path, opts) => {
      beginNavigation(path);
      router.push(path, { scroll: opts?.scroll !== false });
    });
    registerReplace((path) => {
      beginNavigation(path);
      router.replace(path);
    });
    registerBack(() => router.back());

    const onClick = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (/^(https?:|mailto:|tel:|capacitor:)/i.test(href)) return;
      if (!href.startsWith("/")) return;

      e.preventDefault();
      nativeNavigate(href);
    };

    document.addEventListener("click", onClick, true);

    // 네이티브 WebView가 재로드(앱 재개·네이티브 로그인 복귀 등)되기 직전에
    // 스크롤·뒤로가기 스택을 sessionStorage로 백업한다 → 재로드 후에도 위치 복원.
    const flushState = () => {
      persistPageState();
      persistNavStack();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushState();
    };
    window.addEventListener("pagehide", flushState);
    document.addEventListener("visibilitychange", onVisibility);

    let backListener: { remove: () => void } | undefined;

    if (Capacitor.isNativePlatform()) {
      void import("@capacitor/app").then(({ App }) => {
        void App.addListener("backButton", ({ canGoBack }) => {
          handleNativeBack(canGoBack);
        }).then((listener) => {
          backListener = listener;
        });
      });
    }

    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("pagehide", flushState);
      document.removeEventListener("visibilitychange", onVisibility);
      backListener?.remove();
    };
  }, [router, beginNavigation]);

  return null;
}
