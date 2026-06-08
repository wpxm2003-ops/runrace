import type { User } from "firebase/auth";
import { apiFetch, publicFetch } from "./client";
import type {
  ActiveCount,
  ChallengeDetail,
  ChallengeFormBody,
  ChallengeListItem,
  ChallengeWorkoutListItem,
  CreatedId,
  PendingApproval,
  WorkoutDetail,
} from "./types";

/** 대결 목록(공개 — 비로그인도 조회 가능, 로그인 시 isOwner 채워짐). */
export function fetchChallenges(user?: User | null) {
  return publicFetch<ChallengeListItem[]>("/api/challenges", user);
}

/** 내가 참여한 레이스 목록. */
export function fetchMyChallenges(user: User) {
  return apiFetch<ChallengeListItem[]>("/api/challenges/mine", { user });
}

/** 대결 상세(공개). */
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
