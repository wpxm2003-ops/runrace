import { Capacitor } from "@capacitor/core";

/** 카카오·네이버·인스타 등 인앱 브라우저 UA (Google OAuth disallowed_useragent) */
const KNOWN_IN_APP_UA =
  /KAKAOTALK|Instagram|FBAN|FBAV|Line\/|MicroMessenger|Twitter|Snapchat|DaumApps|NAVER\(inapp|NAVER\/[\d.]+ CFNetwork/i;

function isNaverInApp(ua: string): boolean {
  if (!/\bNAVER\b/i.test(ua)) return false;
  if (!/Mobile|Android|iPhone|iPad|iPod/i.test(ua)) return false;
  // Whale/Crosswalk 엔진 + NAVER 조합 (Android 네이버 인앱)
  if (/Whale\/|Crosswalk\/|NAVER\(inapp/i.test(ua)) return true;
  // iOS: Safari UA 뒤에 NAVER(...) 붙는 형태
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  // Android: wv WebView + NAVER
  if (/Android/i.test(ua) && /;\s*wv\)/.test(ua)) return true;
  return false;
}

/** 카카오톡·네이버·인스타 등 인앱 브라우저 — Google OAuth 차단(disallowed_useragent) */
export function isInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  // APK WebView UA에도 "wv"가 들어가서 여기서 false 처리
  if (Capacitor.isNativePlatform()) return false;
  const ua = navigator.userAgent || "";
  if (KNOWN_IN_APP_UA.test(ua)) return true;
  if (isNaverInApp(ua)) return true;
  return false;
}

/**
 * EC2(IP) + signInWithRedirect 는 init.json·쿠키 이슈로 모바일에서 자주 실패.
 * PC/폰 Chrome 모두 popup 사용 (인앱 브라우저는 로그인 버튼에서 차단).
 */
export function preferAuthRedirect(): boolean {
  return false;
}

/** signInWithRedirect 직전 sessionStorage 세팅 */
export function prepareOAuthRedirect(returnTo: string): void {
  sessionStorage.setItem(LOGIN_RETURN_KEY, returnTo);
  sessionStorage.setItem(LOGIN_PENDING_KEY, "1");
}

export function isPopupBlockedError(e: unknown): boolean {
  if (e && typeof e === "object" && "code" in e) {
    const code = String((e as { code: string }).code);
    if (code === "auth/popup-closed-by-user") return false;
    if (code === "auth/popup-blocked" || code === "auth/cancelled-popup-request") {
      return true;
    }
  }
  const msg = String(e);
  if (/popup-closed-by-user|closed by user/i.test(msg)) return false;
  return /popup.*blocked|blocked.*popup/i.test(msg);
}

/**
 * localhost + 커스텀 authDomain(runrace.co.kr) 조합은 signInWithRedirect 복귀가 자주 실패한다.
 */
export function canOAuthRedirectFallback(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "";
  if ((host === "localhost" || host === "127.0.0.1") && authDomain === "runrace.co.kr") {
    return false;
  }
  return true;
}

/** AuthRedirectHandler redirect 복귀 실패 시 로그인 페이지에 표시 */
export const OAUTH_REDIRECT_FAILED_KEY = "runrace_oauth_redirect_failed";

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

  // 네이버 등: target=_blank 가 외부 브라우저로 열리는 경우가 많음
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  const popup = window.open(url, "_blank", "noopener,noreferrer");
  if (popup) return "window";

  if (isAndroid) {
    const path = url.replace(/^https?:\/\//, "");
    const chromeIntent =
      `intent://${path}#Intent;scheme=https;action=android.intent.action.VIEW;` +
      `category=android.intent.category.BROWSABLE;package=com.android.chrome;end`;
    window.location.assign(chromeIntent);
    window.setTimeout(() => {
      window.location.assign(
        `intent://${path}#Intent;scheme=https;action=android.intent.action.VIEW;end`,
      );
    }, 600);
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
