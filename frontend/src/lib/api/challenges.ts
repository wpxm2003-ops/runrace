import type { User } from "firebase/auth";
import { apiFetch, publicFetch } from "./client";
import type {
  ActiveCount,
  ChallengeDetail,
  ChallengeFormBody,
  ChallengeListPage,
  ChallengeWorkoutListItem,
  CreatedId,
  PendingApproval,
  RejectedApproval,
  WorkoutDetail,
} from "./types";

/**
 * 공개 레이스 목록 — 페이지 단위(무한스크롤). 비로그인도 조회 가능(로그인 시 isOwner 채워짐).
 * phase: all|scheduled|in_progress|ended, lang 지정 시 해당 언어방만.
 */
export function fetchChallengesPage(
  user: User | null | undefined,
  opts: { lang?: string; phase?: string; page: number; size?: number },
) {
  const p = new URLSearchParams();
  if (opts.lang) p.set("lang", opts.lang);
  if (opts.phase && opts.phase !== "all") p.set("phase", opts.phase);
  p.set("page", String(opts.page));
  p.set("size", String(opts.size ?? 20));
  return publicFetch<ChallengeListPage>(`/api/challenges?${p.toString()}`, user);
}

/** 내가 참여한 레이스 — 페이지 단위(무한스크롤). phase: all|active|ended. */
export function fetchMyChallengesPage(
  user: User,
  opts: { phase?: string; page: number; size?: number },
) {
  const p = new URLSearchParams();
  if (opts.phase && opts.phase !== "all") p.set("phase", opts.phase);
  p.set("page", String(opts.page));
  p.set("size", String(opts.size ?? 20));
  return apiFetch<ChallengeListPage>(`/api/challenges/mine?${p.toString()}`, { user });
}

/** 레이스 상세(공개). */
export function fetchChallengeDetail(id: number, user?: User | null) {
  return publicFetch<ChallengeDetail>(`/api/challenges/${id}`, user);
}

/** 내가 만든 진행 중 방 개수 / 상한. */
export function fetchActiveCount(user: User) {
  return apiFetch<ActiveCount>("/api/challenges/active-count", { user });
}

export function createChallenge(body: ChallengeFormBody, user: User) {
  return apiFetch<CreatedId>("/api/challenges", { method: "POST", user, body });
}

export function updateChallenge(id: number, body: ChallengeFormBody, user: User) {
  return apiFetch<CreatedId>(`/api/challenges/${id}`, { method: "PUT", user, body });
}

export function deleteChallenge(id: number, user: User, returnTo?: string) {
  return apiFetch<void>(`/api/challenges/${id}`, { method: "DELETE", user, returnTo });
}

export function joinChallenge(id: number, user: User, returnTo?: string) {
  return apiFetch<void>(`/api/challenges/${id}/join`, { method: "POST", user, returnTo });
}

export function leaveChallenge(id: number, user: User, returnTo?: string) {
  return apiFetch<void>(`/api/challenges/${id}/leave`, { method: "POST", user, returnTo });
}

/** 레이스 참여자만 — 레이스에 반영된 운동 목록 */
export function fetchChallengeWorkouts(challengeId: number, user: User) {
  return apiFetch<ChallengeWorkoutListItem[]>(`/api/challenges/${challengeId}/workouts`, { user });
}

/** 레이스 맥락 운동 상세 (참여자만) */
export function fetchChallengeWorkout(challengeId: number, workoutId: number, user: User) {
  return apiFetch<WorkoutDetail>(`/api/challenges/${challengeId}/workouts/${workoutId}`, { user });
}

/** 레이스 — 승인 대기 중인 실내러닝 목록 */
export function fetchPendingApprovals(challengeId: number, user: User) {
  return apiFetch<PendingApproval[]>(`/api/challenges/${challengeId}/pending-approvals`, { user });
}

/** 레이스 — 거부된 실내러닝 목록 */
export function fetchRejectedApprovals(challengeId: number, user: User) {
  return apiFetch<RejectedApproval[]>(`/api/challenges/${challengeId}/rejected-approvals`, { user });
}
