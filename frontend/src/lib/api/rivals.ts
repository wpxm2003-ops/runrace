import type { User } from "firebase/auth";
import { apiFetch } from "./client";
import type { RivalRow } from "./types";

/** 내 라이벌 목록(전적 포함, 최근 등록 순). */
export function fetchRivals(user: User) {
  return apiFetch<RivalRow[]>("/api/rivals", { user });
}

/** 닉네임으로 라이벌 등록(팔로우식 단방향, 수락 불필요). */
export function addRival(nickname: string, user: User) {
  return apiFetch<void>("/api/rivals", { method: "POST", user, body: { nickname } });
}

/** 라이벌 해제. */
export function removeRival(rivalUserId: string, user: User) {
  return apiFetch<void>(`/api/rivals/${rivalUserId}`, { method: "DELETE", user });
}
