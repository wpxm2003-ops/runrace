import type { User } from "firebase/auth";
import { apiFetch } from "./client";

/**
 * Firebase 로그인 직후 백엔드에 사용자 upsert를 트리거한다.
 * (로그인 페이지·리다이렉트 핸들러 양쪽에서 공용)
 */
export function syncBackendLogin(user: User) {
  return apiFetch("/api/auth/login", { method: "POST", user, redirectOn401: false });
}
