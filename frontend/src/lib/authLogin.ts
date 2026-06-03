import { Capacitor } from "@capacitor/core";

/** 카카오톡·인스타 등 인앱 브라우저 — Google OAuth 차단(disallowed_useragent) */
export function isInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  // APK WebView UA에도 "wv"가 들어가서 여기서 false 처리
  if (Capacitor.isNativePlatform()) return false;
  const ua = navigator.userAgent || "";
  return /KAKAOTALK|Instagram|FBAN|FBAV|Line\/|MicroMessenger|Twitter|Snapchat/i.test(ua);
}

/**
 * EC2(IP) + signInWithRedirect 는 init.json·쿠키 이슈로 모바일에서 자주 실패.
 * PC/폰 Chrome 모두 popup 사용 (인앱 브라우저는 로그인 버튼에서 차단).
 */
export function preferAuthRedirect(): boolean {
  return false;
}

export const IN_APP_LOGIN_MESSAGE =
  "카카오톡·인스타 등 앱 안 브라우저에서는 Google 로그인이 차단됩니다. 메뉴(⋮)에서 Chrome·Safari로 열거나, 주소를 복사해 일반 브라우저에서 접속해 주세요.";

export const LOGIN_RETURN_KEY = "runrace_login_return";

/** signInWithRedirect 직후 백엔드 동기화 필요 */
export const LOGIN_PENDING_KEY = "runrace_oauth_pending";

export function safeReturnPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/";
  }
  return raw;
}
