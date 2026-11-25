import { Capacitor } from "@capacitor/core";
import { isIosWeb, isNativeApp } from "./nativeNav";

/**
 * 클라이언트 플랫폼 — GA4 사용자 속성 `platform`과 일일 활성 핑(POST /api/activity/ping)에
 * 같은 값을 쓴다. 서버 `ClientPlatform` enum과 값이 같아야 한다.
 *
 * - android_app: Capacitor Android 앱(WebView)
 * - ios_web: 아이폰·아이패드 브라우저/PWA(iOS 네이티브 앱은 없다)
 * - web: 그 밖의 브라우저(데스크톱·안드로이드 모바일 웹 포함)
 */
export type ClientPlatform = "android_app" | "web" | "ios_web";

/**
 * 판정 규칙(순수 함수 — 테스트용으로 분리).
 * iOS 네이티브 앱이 생기면 "ios_app"을 추가하고 서버 enum도 함께 고친다. 그 전까지 네이티브는
 * Android뿐이라 nativePlatform이 "android"일 때만 앱으로 본다.
 */
export function resolveClientPlatform(env: {
  /** 네이티브 앱이면 Capacitor.getPlatform() 값, 아니면 null. */
  nativePlatform: string | null;
  /** 네이티브가 아닌 iOS 기기 브라우저인지(nativeNav.isIosWeb). */
  iosWeb: boolean;
}): ClientPlatform {
  if (env.nativePlatform === "android") return "android_app";
  if (env.iosWeb) return "ios_web";
  return "web";
}

/** 현재 실행 환경의 플랫폼. SSR에서는 "web". */
export function detectClientPlatform(): ClientPlatform {
  return resolveClientPlatform({
    nativePlatform: isNativeApp() ? Capacitor.getPlatform() : null,
    iosWeb: isIosWeb(),
  });
}
