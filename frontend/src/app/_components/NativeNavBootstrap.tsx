"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { registerPush } from "@/lib/nativeNav";

/**
 * Next.js router.push를 전역에 등록해 SPA 전환을 활성화한다.
 * - 웹/APK 모두 <a href> 클릭을 router.push로 처리 → 풀페이지 리로드 없음
 * - nativeNavigate() 호출도 router.push를 사용한다
 */
export function NativeNavBootstrap() {
  const router = useRouter();

  useEffect(() => {
    // programmatic nativeNavigate() 에 router.push 등록
    registerPush((path) => router.push(path));

    // <a href> 클릭 인터셉트 → SPA 전환
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
      router.push(href);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [router]);

  return null;
}
