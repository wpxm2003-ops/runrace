import type { User } from "firebase/auth";
import { apiFetch } from "./client";
import type { MeResponse } from "./types";

/**
 * Firebase 로그인 직후 백엔드에 사용자 upsert를 트리거한다.
 * (로그인 페이지·리다이렉트 핸들러 양쪽에서 공용)
 */
export function syncBackendLogin(user: User) {
  return apiFetch("/api/auth/login", { method: "POST", user, redirectOn401: false });
}

export function fetchMe(user: User): Promise<MeResponse> {
  return apiFetch<MeResponse>("/api/me", { user });
}

export function updateNickname(user: User, nickname: string): Promise<MeResponse> {
  return apiFetch<MeResponse>("/api/me/nickname", {
    method: "PATCH",
    user,
    body: { nickname },
  });
}
