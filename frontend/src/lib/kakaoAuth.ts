import { Capacitor } from "@capacitor/core";
import { signInWithCustomToken } from "firebase/auth";
import { auth } from "./firebase";
import { publicPost, apiFetch } from "./api/client";
import { LOGIN_RETURN_KEY, safeReturnPath } from "./authLogin";
import { markLoggedIn } from "./AuthProvider";
import { nativeNavigate } from "./nativeNav";
import { setAnalyticsUser, track } from "./analytics";

/** 네이티브 앱 복귀용 커스텀 스킴 — 카카오 OAuth redirect_uri로는 사용 불가(KOE006) */
export const KAKAO_NATIVE_CALLBACK_SCHEME = "com.runrace.app://kakao/callback";

/** 네이티브 OAuth 시 state에 붙이는 접두사 (인앱 브라우저 → 앱 복귀 판별) */
export const KAKAO_NATIVE_STATE_PREFIX = "native:";

/** 카카오 OAuth 콜백 URI — 웹·앱 모두 등록된 https URL 사용 */
export function kakaoRedirectUri(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/kakao/callback`;
}

export function isNativeKakaoOAuthState(state: string | null | undefined): boolean {
  return !!state?.startsWith(KAKAO_NATIVE_STATE_PREFIX);
}

export function parseNativeReturnToFromState(state: string | null): string {
  if (!isNativeKakaoOAuthState(state)) return "/";
  return safeReturnPath(decodeURIComponent(state!.slice(KAKAO_NATIVE_STATE_PREFIX.length))) || "/";
}

/** 인앱 브라우저 콜백 페이지 → 앱 WebView로 code 전달 */
export function buildNativeKakaoCallbackUrl(params: {
  code?: string | null;
  error?: string | null;
  state?: string | null;
}): string {
  const url = new URL(KAKAO_NATIVE_CALLBACK_SCHEME);
  if (params.code) url.searchParams.set("code", params.code);
  if (params.error) url.searchParams.set("error", params.error);
  if (params.state) url.searchParams.set("state", params.state);
  return url.toString();
}

/** 카카오 로그인 OAuth URL 생성 */
export function kakaoLoginUrl(returnTo?: string | null): string {
  const restApiKey = process.env.NEXT_PUBLIC_KAKAO_REST_API_KEY ?? "";
  const redirectUri = kakaoRedirectUri();
  const url = new URL("https://kauth.kakao.com/oauth/authorize");
  url.searchParams.set("client_id", restApiKey);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  if (Capacitor.isNativePlatform()) {
    const path = safeReturnPath(returnTo) || "/";
    url.searchParams.set("state", `${KAKAO_NATIVE_STATE_PREFIX}${encodeURIComponent(path)}`);
  }
  return url.toString();
}

function parseOAuthCallback(url: string): {
  code: string | null;
  error: string | null;
  state: string | null;
} {
  const q = url.indexOf("?");
  if (q < 0) return { code: null, error: null, state: null };
  const params = new URLSearchParams(url.slice(q + 1));
  return {
    code: params.get("code"),
    error: params.get("error"),
    state: params.get("state"),
  };
}

export function isNativeKakaoCallbackUrl(url: string): boolean {
  return url.startsWith(KAKAO_NATIVE_CALLBACK_SCHEME);
}

/**
 * App Links로 앱이 직접 가로챈 https 콜백인지 판별.
 * 카카오톡 간편로그인 시 외부 브라우저로 새던 https 콜백을 앱이 바로 받는다.
 */
export function isHttpsKakaoCallbackUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      (u.protocol === "https:" || u.protocol === "http:") &&
      u.pathname.startsWith("/kakao/callback")
    );
  } catch {
    return false;
  }
}

let processingOAuthReturn = false;

/**
 * 네이티브 앱 OAuth 콜백 복귀 시 로그인 완료. appUrlOpen 리스너에서 호출한다.
 * - com.runrace.app://kakao/callback (인앱 브라우저 → 커스텀 스킴 바운스)
 * - https://runrace.co.kr/kakao/callback (App Links로 앱이 직접 수신)
 */
export async function processKakaoOAuthReturn(url: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  const isCustom = isNativeKakaoCallbackUrl(url);
  const isHttps = isHttpsKakaoCallbackUrl(url);
  // https 콜백은 네이티브 OAuth(state=native:)일 때만 처리 (일반 웹 링크 오작동 방지)
  if (isHttps && !isNativeKakaoOAuthState(parseOAuthCallback(url).state)) return false;
  if (!isCustom && !isHttps) return false;
  if (processingOAuthReturn) return true;
  processingOAuthReturn = true;

  try {
    const { Browser } = await import("@capacitor/browser");
    await Browser.close().catch(() => {});

    const { code, error, state } = parseOAuthCallback(url);
    if (error || !code) {
      nativeNavigate("/login");
      return true;
    }

    const returnTo = isNativeKakaoOAuthState(state)
      ? parseNativeReturnToFromState(state)
      : safeReturnPath(sessionStorage.getItem(LOGIN_RETURN_KEY)) || "/";
    sessionStorage.removeItem(LOGIN_RETURN_KEY);

    await completeKakaoLogin(code);
    const uid = auth.currentUser?.uid;
    if (uid) void setAnalyticsUser(uid);
    void track("login", { method: "kakao" });
    markLoggedIn();
    nativeNavigate(returnTo);
    return true;
  } catch {
    nativeNavigate("/login");
    return true;
  } finally {
    processingOAuthReturn = false;
  }
}

/** 카카오 로그인 시작. 네이티브는 인앱 브라우저, 웹은 페이지 이동. */
export async function startKakaoLogin(returnTo?: string | null): Promise<void> {
  if (returnTo) {
    sessionStorage.setItem(LOGIN_RETURN_KEY, returnTo);
  }

  if (Capacitor.isNativePlatform()) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url: kakaoLoginUrl(returnTo) });
    return;
  }

  window.location.href = kakaoLoginUrl(returnTo);
}

/**
 * 카카오 콜백 페이지(웹)에서 호출.
 * authorization code → 백엔드 → Firebase Custom Token → Firebase 세션 생성.
 */
export async function completeKakaoLogin(code: string): Promise<void> {
  const redirectUri = kakaoRedirectUri();

  const { firebaseCustomToken } = await publicPost<{ firebaseCustomToken: string }>(
    "/api/auth/kakao",
    { code, redirectUri },
  );

  await signInWithCustomToken(auth, firebaseCustomToken);

  const user = auth.currentUser;
  if (user) {
    await apiFetch("/api/auth/login", { method: "POST", user, redirectOn401: false });
  }
}
