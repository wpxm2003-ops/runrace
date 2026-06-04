import { signInWithCustomToken } from "firebase/auth";
import { auth } from "./firebase";
import { LOGIN_RETURN_KEY } from "./authLogin";
import { publicPost } from "./api/client";
import { apiFetch } from "./api/client";

const KAKAO_REST_API_KEY = process.env.NEXT_PUBLIC_KAKAO_REST_API_KEY ?? "";
const KAKAO_AUTH_URL = "https://kauth.kakao.com/oauth/authorize";

/** 카카오 OAuth 콜백 URI — 실행 환경의 origin에서 자동 결정 */
export function kakaoRedirectUri(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/kakao/callback`;
}

/**
 * 카카오 로그인 페이지로 리다이렉트한다.
 * 로그인 완료 후 돌아올 경로를 sessionStorage에 저장한다.
 */
export function redirectToKakao(returnTo?: string): void {
  if (!KAKAO_REST_API_KEY) {
    throw new Error("NEXT_PUBLIC_KAKAO_REST_API_KEY 환경변수가 설정되지 않았습니다.");
  }

  sessionStorage.setItem(LOGIN_RETURN_KEY, returnTo ?? window.location.pathname);

  const params = new URLSearchParams({
    client_id: KAKAO_REST_API_KEY,
    redirect_uri: kakaoRedirectUri(),
    response_type: "code",
    // 카카오계정으로 로그인 강제 (계정 전환 허용)
    prompt: "login",
  });

  window.location.href = `${KAKAO_AUTH_URL}?${params.toString()}`;
}

/**
 * 카카오 콜백 페이지에서 호출.
 * authorization code → 백엔드 → Firebase Custom Token → Firebase 세션 생성.
 *
 * @returns Firebase User
 */
export async function completeKakaoLogin(code: string): Promise<void> {
  const redirectUri = kakaoRedirectUri();

  // 1. 백엔드에서 Firebase Custom Token 발급
  const { firebaseCustomToken } = await publicPost<{ firebaseCustomToken: string }>(
    "/api/auth/kakao",
    { code, redirectUri },
  );

  // 2. Firebase 세션 생성
  await signInWithCustomToken(auth, firebaseCustomToken);

  // 3. 백엔드 사용자 동기화 (app_user upsert 확인)
  const user = auth.currentUser;
  if (user) {
    await apiFetch("/api/auth/login", { method: "POST", user, redirectOn401: false });
  }
}
