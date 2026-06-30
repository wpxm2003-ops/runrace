import type { User } from "firebase/auth";
import { apiFetch, exchangeFirebaseTokenForJwt } from "./client";
import { clearAccessToken } from "@/lib/accessToken";
import type { MeResponse } from "./types";

/**
 * Firebase 로그인 직후 백엔드에 사용자 upsert를 트리거하고 자체 JWT를 발급받는다.
 * Firebase 토큰을 직접 사용해 새 JWT를 받아오므로 기존 저장 토큰을 우선하지 않는다.
 */
export function syncBackendLogin(user: User): Promise<void> {
  return exchangeFirebaseTokenForJwt(user);
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

export function updateLanguage(user: User, langCd: string): Promise<MeResponse> {
  return apiFetch<MeResponse>("/api/me/language", {
    method: "PATCH",
    user,
    body: { langCd },
  });
}

export async function deleteAccount(user: User): Promise<void> {
  await apiFetch<void>("/api/me", { method: "DELETE", user });
  clearAccessToken();
}
