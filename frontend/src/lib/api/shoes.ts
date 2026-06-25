import type { User } from "firebase/auth";
import { apiFetch } from "./client";
import type { ShoeFormBody, ShoeRow } from "./types";

/** 내 신발 목록(누적 거리 포함, 최근 등록 순). */
export function fetchShoes(user: User) {
  return apiFetch<ShoeRow[]>("/api/shoes", { user });
}

/** 신발 등록. 첫 신발이거나 active=true면 활성 신발로 지정된다. */
export function createShoe(body: ShoeFormBody, user: User) {
  return apiFetch<ShoeRow>("/api/shoes", { method: "POST", user, body });
}

/** 신발 정보 수정(활성 여부 제외). */
export function updateShoe(id: number, body: ShoeFormBody, user: User) {
  return apiFetch<void>(`/api/shoes/${id}`, { method: "PUT", user, body });
}

/** 신발 삭제. 귀속된 러닝 기록은 보존되고 귀속만 해제된다. */
export function deleteShoe(id: number, user: User) {
  return apiFetch<void>(`/api/shoes/${id}`, { method: "DELETE", user });
}

/** 활성 신발 전환(기존 활성은 자동 해제). */
export function activateShoe(id: number, user: User) {
  return apiFetch<void>(`/api/shoes/${id}/activate`, { method: "POST", user });
}
