/**
 * SWR 기반 데이터 훅 모음.
 * 캐싱 없음 — 페이지 진입 시 항상 최신 데이터를 서버에서 받아온다.
 */
import useSWR, { mutate as globalMutate } from "swr";
import type { User } from "firebase/auth";
import {
  fetchChallenges,
  fetchChallengeDetail,
  fetchActiveCount,
  fetchMyChallenges,
  fetchChallengeWorkouts,
} from "./challenges";
import { fetchFriends } from "./friends";
import { fetchWorkout, fetchWorkoutSummary, fetchWorkoutsByYear } from "./workouts";
import { fetchMe } from "./auth";

const BASE_CONFIG = {
  revalidateOnMount: true,
  revalidateOnFocus: false,
  keepPreviousData: false,
  /** 개발 모드 이중 마운트·동시 훅 호출 시 같은 API 중복 요청 방지 */
  dedupingInterval: 5000,
} as const;

// ── 대결 목록 ────────────────────────────────────────────────────────────────
/**
 * 공개 API이지만 로그인 여부에 따라 isOwner 필드가 달라지므로 userId를 키에 포함한다.
 * 비로그인 상태에서도 목록 자체는 즉시 보여준다.
 */
export function useChallengeList(user?: User | null, authLoading = false) {
  return useSWR(
    authLoading ? null : (["challenges", user?.uid ?? null] as const),
    () => fetchChallenges(user),
    BASE_CONFIG,
  );
}

export function useMyChallengeList(user: User | null) {
  return useSWR(
    user ? (["challenges", "mine", user.uid] as const) : null,
    () => fetchMyChallenges(user!),
    BASE_CONFIG,
  );
}

// ── 대결 상세 ────────────────────────────────────────────────────────────────
export function useChallengeDetail(id: number | null, user?: User | null, authLoading = false) {
  return useSWR(
    authLoading || id == null ? null : (["challenge", id, user?.uid ?? null] as const),
    () => fetchChallengeDetail(id!, user),
    BASE_CONFIG,
  );
}

/** 대결 상세를 SWR 캐시에서 무효화한다 (참여/수정/삭제 후 갱신용). */
export function invalidateChallengeDetail(id: number, userId?: string | null) {
  void globalMutate(["challenge", id, userId ?? null]);
}

export function useChallengeWorkouts(
  challengeId: number | null,
  user: User | null,
  enabled: boolean,
) {
  return useSWR(
    enabled && challengeId != null && user
      ? (["challenge", challengeId, "workouts", user.uid] as const)
      : null,
    () => fetchChallengeWorkouts(challengeId!, user!),
    BASE_CONFIG,
  );
}

// ── 활성 방 개수 ─────────────────────────────────────────────────────────────
export function useActiveCount(user: User | null) {
  return useSWR(
    user ? (["active-count", user.uid] as const) : null,
    () => fetchActiveCount(user!),
    BASE_CONFIG,
  );
}

// ── 친구 목록 ────────────────────────────────────────────────────────────────
export function useFriendList(user: User | null) {
  return useSWR(
    user ? (["friends", user.uid] as const) : null,
    () => fetchFriends(user!),
    BASE_CONFIG,
  );
}

// ── 운동 기록 ─────────────────────────────────────────────────────────────────
/** 내정보 — 전체 요약 */
export function useWorkoutSummary(user: User | null) {
  return useSWR(
    user ? (["workouts", "summary", user.uid] as const) : null,
    () => fetchWorkoutSummary(user!),
    BASE_CONFIG,
  );
}

/** 기록 달력 — 해당 연도 목록 (연도 변경 시 자동 재요청) */
export function useWorkoutListByYear(user: User | null, year: number) {
  return useSWR(
    user ? (["workouts", user.uid, year] as const) : null,
    () => fetchWorkoutsByYear(user!, year),
    BASE_CONFIG,
  );
}

export function invalidateWorkoutLists(userId: string, year?: number) {
  void globalMutate(["workouts", "summary", userId]);
  if (year != null) {
    void globalMutate(["workouts", userId, year]);
  }
}

/** 기록 탭·상세 — 동일 id 중복 요청 방지 (dedupingInterval) */
export function useWorkoutDetail(workoutId: number | null, user: User | null) {
  return useSWR(
    user && workoutId != null
      ? (["workout", workoutId, user.uid] as const)
      : null,
    () => fetchWorkout(workoutId!, user!),
    {
      revalidateOnMount: true,
      revalidateOnFocus: false,
      keepPreviousData: false,
      dedupingInterval: 5000,
    },
  );
}

export function invalidateWorkoutDetail(workoutId: number, userId: string) {
  void globalMutate(["workout", workoutId, userId]);
}

// ── 내 정보 (닉네임 포함) ────────────────────────────────────────────────────
export function useMe(user: User | null) {
  return useSWR(
    user ? (["me", user.uid] as const) : null,
    () => fetchMe(user!),
    BASE_CONFIG,
  );
}
