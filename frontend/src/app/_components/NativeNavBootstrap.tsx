"use client";

import { isNativeApp, nativeNavigate } from "@/lib/nativeNav";
import { useEffect } from "react";

/**
 * APK(WebView)에서 <a href="/..."> 클릭 시 Next 라우터 대신 .html 전체 로드
 */
export function NativeNavBootstrap() {
  useEffect(() => {
    if (!isNativeApp()) return;

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
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
