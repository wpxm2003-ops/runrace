import { signInWithCustomToken } from "firebase/auth";
import { auth } from "./firebase";
import { publicPost } from "./api/client";
import { apiFetch } from "./api/client";

/** 카카오 OAuth 콜백 URI — 실행 환경의 origin에서 자동 결정 */
export function kakaoRedirectUri(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/kakao/callback`;
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
