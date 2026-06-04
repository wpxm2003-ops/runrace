/**
 * SWR 기반 데이터 훅 모음.
 *
 * keepPreviousData: 키가 바뀌거나 revalidation 중에도 이전 데이터를 유지한다.
 * 덕분에 페이지 이동 후 돌아와도 즉시 이전 데이터를 보여주고, 백그라운드에서 갱신한다.
 *
 * revalidateOnFocus: 탭 복귀 시 자동 갱신 — 다른 기기에서 변경된 내용도 반영.
 * dedupingInterval: 같은 키 요청을 5초 내에 중복 실행하지 않는다.
 */
import useSWR, { mutate as globalMutate } from "swr";
import type { User } from "firebase/auth";
import {
  fetchChallenges,
  fetchChallengeDetail,
  fetchActiveCount,
} from "./challenges";
import { fetchFriends } from "./friends";
import { fetchWorkouts } from "./workouts";

const BASE_CONFIG = {
  revalidateOnFocus: true,
  keepPreviousData: true,
  dedupingInterval: 5_000,
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

// ── 운동 기록 목록 ───────────────────────────────────────────────────────────
export function useWorkoutList(user: User | null) {
  return useSWR(
    user ? (["workouts", user.uid] as const) : null,
    () => fetchWorkouts(user!),
    BASE_CONFIG,
  );
}
