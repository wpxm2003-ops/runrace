import type { User } from "firebase/auth";
import { apiFetch } from "./client";
import type { Friend, InviteResult } from "./types";

export function fetchFriends(user: User) {
  return apiFetch<Friend[]>("/api/friends", { user });
}

export function createInvite(user: User) {
  return apiFetch<InviteResult>("/api/friends/invites", { method: "POST", user });
}

export function acceptInvite(code: string, user: User) {
  return apiFetch<void>(`/api/friends/invites/${code}/accept`, { method: "POST", user });
}
