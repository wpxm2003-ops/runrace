import { signInWithCustomToken } from "firebase/auth";
import { auth } from "./firebase";
import { publicPost, apiFetch } from "./api/client";
import { LOGIN_RETURN_KEY } from "./authLogin";

/** 카카오 OAuth 콜백 URI — 실행 환경의 origin에서 자동 결정 */
export function kakaoRedirectUri(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/kakao/callback`;
}

/** 카카오 로그인 OAuth URL 생성. returnTo는 콜백 복귀 후 이동할 경로. */
export function kakaoLoginUrl(returnTo?: string | null): string {
  const restApiKey = process.env.NEXT_PUBLIC_KAKAO_REST_API_KEY ?? "";
  const redirectUri = kakaoRedirectUri();
  const url = new URL("https://kauth.kakao.com/oauth/authorize");
  url.searchParams.set("client_id", restApiKey);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  return url.toString();
}

/** 카카오 로그인 시작. sessionStorage에 returnTo를 저장 후 카카오로 이동. */
export function startKakaoLogin(returnTo?: string | null): void {
  if (returnTo) {
    sessionStorage.setItem(LOGIN_RETURN_KEY, returnTo);
  }
  window.location.href = kakaoLoginUrl(returnTo);
}

/**
 * 카카오 콜백 페이지에서 호출.
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
