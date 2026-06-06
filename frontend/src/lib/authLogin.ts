import { Capacitor } from "@capacitor/core";

const IN_APP_UA =
  /KAKAOTALK|Instagram|FBAN|FBAV|Line\/|MicroMessenger|Twitter|Snapchat|NAVER\(inapp|NaverWebView/i;

/** 카카오톡·네이버·인스타 등 인앱 브라우저 — Google OAuth 차단(disallowed_useragent) */
export function isInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  // APK WebView UA에도 "wv"가 들어가서 여기서 false 처리
  if (Capacitor.isNativePlatform()) return false;
  const ua = navigator.userAgent || "";
  return IN_APP_UA.test(ua);
}

/**
 * EC2(IP) + signInWithRedirect 는 init.json·쿠키 이슈로 모바일에서 자주 실패.
 * PC/폰 Chrome 모두 popup 사용 (인앱 브라우저는 로그인 버튼에서 차단).
 */
export function preferAuthRedirect(): boolean {
  return false;
}

export const IN_APP_LOGIN_MESSAGE =
  "네이버·카카오톡·인스타 등 앱 안 브라우저에서는 Google 로그인이 차단됩니다. 아래 버튼으로 Chrome·Safari에서 열어 주세요.";

export const IN_APP_OPEN_BROWSER_LABEL = "Chrome/Safari에서 열기";

export const IN_APP_URL_COPIED_MESSAGE =
  "주소가 복사되었습니다. Safari 또는 Chrome 앱 주소창에 붙여넣어 주세요.";

export function buildLoginPageUrl(returnTo: string): string {
  if (typeof window === "undefined") return "/login";
  const base = `${window.location.origin}/login`;
  if (!returnTo || returnTo === "/") return base;
  return `${base}?return=${encodeURIComponent(returnTo)}`;
}

/** 인앱 브라우저 → 시스템 브라우저(Chrome/Safari)로 로그인 페이지 열기 */
export async function openInExternalBrowser(url: string): Promise<"intent" | "copy" | "window"> {
  const ua = navigator.userAgent || "";
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);

  if (isAndroid) {
    const path = url.replace(/^https?:\/\//, "");
    const chromeIntent =
      `intent://${path}#Intent;scheme=https;action=android.intent.action.VIEW;` +
      `category=android.intent.category.BROWSABLE;package=com.android.chrome;end`;
    window.location.assign(chromeIntent);
    return "intent";
  }

  if (isIOS) {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("아래 주소를 복사해 Safari/Chrome에서 열어 주세요.", url);
    }
    window.location.assign(url.replace(/^https:\/\//, "googlechromes://"));
    return "copy";
  }

  window.open(url, "_blank", "noopener,noreferrer");
  return "window";
}

export const LOGIN_RETURN_KEY = "runrace_login_return";

/** signInWithRedirect 직후 백엔드 동기화 필요 */
export const LOGIN_PENDING_KEY = "runrace_oauth_pending";

export function safeReturnPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/";
  }
  return raw;
}
