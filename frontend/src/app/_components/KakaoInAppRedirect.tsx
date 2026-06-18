"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";

/**
 * 카카오톡 인앱 브라우저(Android)에서 열린 경우, 현재 경로를 설치된 앱으로 넘긴다.
 *
 * 카톡 채팅의 링크는 카톡 자체 인앱 브라우저로 열려 Android App Links가 발동하지 않는다.
 * 그래서 페이지 로드 시 intent:// 로 앱 실행을 시도한다.
 *  - 앱 설치됨: App Links 인텐트로 앱이 열려 해당 경로로 이동(DeepLinkBootstrap)
 *  - 미설치: browser_fallback_url(현재 URL)로 떨어져 그대로 웹으로 본다
 *
 * 우리 앱 웹뷰(Capacitor)·일반 브라우저·비안드로이드에서는 동작하지 않는다.
 */
const TRIED_KEY = "rr_app_open_tried";

export function KakaoInAppRedirect() {
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return; // 우리 앱 웹뷰는 제외
    if (typeof navigator === "undefined" || typeof window === "undefined") return;

    const ua = navigator.userAgent || "";
    if (!/Android/i.test(ua) || !/KAKAOTALK/i.test(ua)) return; // 안드로이드 카톡 인앱브라우저만

    try {
      if (sessionStorage.getItem(TRIED_KEY)) return; // 세션당 1회 (폴백 재로드 시 루프 방지)
      sessionStorage.setItem(TRIED_KEY, "1");
    } catch {
      /* sessionStorage 불가 시 그대로 진행 */
    }

    const { host, pathname, search, href } = window.location;
    const intentUrl =
      `intent://${host}${pathname}${search}` +
      `#Intent;scheme=https;package=com.runrace.app;` +
      `S.browser_fallback_url=${encodeURIComponent(href)};end`;

    window.location.href = intentUrl;
  }, []);

  return null;
}
