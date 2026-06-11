/**
 * SWR 기반 데이터 훅 모음.
 * stale-while-revalidate — 캐시된 데이터를 즉시 보여주고 백그라운드에서 갱신한다.
 * 쓰기(참여/투표/기록 등) 후에는 각 invalidate* 헬퍼로 즉시 재검증한다.
 */
import useSWR, { mutate as globalMutate } from "swr";
import useSWRInfinite from "swr/infinite";
import type { User } from "firebase/auth";
import {
  fetchChallengesPage,
  fetchChallengeDetail,
  fetchActiveCount,
  fetchMyChallengesPage,
  fetchChallengeWorkouts,
  fetchChallengeWorkout,
  fetchPendingApprovals,
  fetchRejectedApprovals,
} from "./challenges";
import { fetchFriends } from "./friends";
import { fetchWorkout, fetchWorkoutShare, fetchWorkoutSummary, fetchWorkoutsByYear } from "./workouts";
import { fetchMe } from "./auth";
import { SWR_ERROR_RETRY } from "./swrConfig";

const BASE_CONFIG = {
  /** 진입 시 항상 백그라운드 재검증하되, 그동안 캐시된 데이터를 먼저 보여준다. */
  revalidateOnMount: true,
  revalidateOnFocus: false,
  /** 탭 전환·연도 변경 시 스켈레톤 깜빡임 없이 이전 데이터를 유지하며 갱신 */
  keepPreviousData: true,
  /** 짧은 시간 내 동일 키 재요청 방지(이중 마운트·연속 내비게이션) */
  dedupingInterval: 3000,
  ...SWR_ERROR_RETRY,
};

// ── 레이스 목록 ────────────────────────────────────────────────────────────────
/**
 * 공개 API이지만 로그인 여부에 따라 isOwner 필드가 달라지므로 userId를 키에 포함한다.
 * 비로그인 상태에서도 목록 자체는 즉시 보여준다.
 */
/**
 * 공개 레이스 목록 — phase 필터별 무한스크롤. 페이지 끝(hasNext=false)에 도달하면 추가 키를 만들지 않는다.
 * 필터/언어 변경 시 호출 측에서 setSize(1)로 첫 페이지부터 다시 로드한다.
 */
const PUBLIC_PAGE_SIZE = 20;

export function useChallengeListInfinite(
  user: User | null | undefined,
  authLoading: boolean,
  lang: string | undefined,
  phase: string,
) {
  return useSWRInfinite(
    (index, previous) => {
      if (authLoading) return null;
      if (previous && !previous.hasNext) return null;
      return ["challenges-page", user?.uid ?? null, lang ?? null, phase, index] as const;
    },
    (key) =>
      fetchChallengesPage(user, {
        lang,
        phase,
        page: key[4] as number,
        size: PUBLIC_PAGE_SIZE,
      }),
    {
      revalidateFirstPage: false,
      revalidateOnFocus: true,
      keepPreviousData: true,
      dedupingInterval: 3000,
      ...SWR_ERROR_RETRY,
    },
  );
}

/** 내 레이스 — phase(active/ended)별 무한스크롤. 필터 변경 시 호출 측에서 setSize(1). */
export function useMyChallengeListInfinite(user: User | null, phase: string) {
  return useSWRInfinite(
    (index, previous) => {
      if (!user) return null;
      if (previous && !previous.hasNext) return null;
      return ["challenges-mine-page", user.uid, phase, index] as const;
    },
    (key) =>
      fetchMyChallengesPage(user!, {
        phase,
        page: key[3] as number,
        size: PUBLIC_PAGE_SIZE,
      }),
    {
      revalidateFirstPage: false,
      revalidateOnFocus: true,
      keepPreviousData: true,
      dedupingInterval: 3000,
      ...SWR_ERROR_RETRY,
    },
  );
}

// ── 레이스 상세 ────────────────────────────────────────────────────────────────
export function useChallengeDetail(id: number | null, user?: User | null, authLoading = false) {
  return useSWR(
    authLoading || id == null ? null : (["challenge", id, user?.uid ?? null] as const),
    () => fetchChallengeDetail(id!, user),
    BASE_CONFIG,
  );
}

/** 레이스 목록(공개·내 레이스) 무한스크롤 캐시 무효화 — 생성/참여/탈퇴/삭제 후 호출. */
export function invalidateChallengeLists() {
  void globalMutate(
    (key) =>
      Array.isArray(key) &&
      (key[0] === "challenges-page" || key[0] === "challenges-mine-page"),
    undefined,
    { revalidate: true },
  );
}

/** 레이스 참여자 운동기록 목록을 갱신한다 (실내러닝 승인 반영 후). */
export function invalidateChallengeWorkouts(challengeId: number, userId: string) {
  void globalMutate(["challenge", challengeId, "workouts", userId]);
}

/** 닉네임 변경 후 닉네임이 노출되는 SWR 캐시를 재검증한다. */
export function invalidateAfterNicknameChange(userId: string) {
  void globalMutate(
    (key) => {
      if (!Array.isArray(key)) return false;
      const [head, a, b, c] = key;
      if (head === "me" && a === userId) return true;
      if (head === "friends" && a === userId) return true;
      if (head === "challenges" && (a === userId || a === "mine")) return true;
      if (head === "challenge" && (b === userId || c === userId)) return true;
      return false;
    },
    undefined,
    { revalidate: true },
  );
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

// ── 실내러닝 승인 (레이스 참여·시작 후에만) ──────────────────────────────────
export function usePendingApprovals(
  challengeId: number | null,
  user: User | null,
  enabled: boolean,
) {
  return useSWR(
    enabled && challengeId != null && user
      ? (["challenge", challengeId, "pending-approvals", user.uid] as const)
      : null,
    () => fetchPendingApprovals(challengeId!, user!),
    BASE_CONFIG,
  );
}

export function useRejectedApprovals(
  challengeId: number | null,
  user: User | null,
  enabled: boolean,
) {
  return useSWR(
    enabled && challengeId != null && user
      ? (["challenge", challengeId, "rejected-approvals", user.uid] as const)
      : null,
    () => fetchRejectedApprovals(challengeId!, user!),
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
    BASE_CONFIG,
  );
}

export function invalidateWorkoutDetail(workoutId: number, userId: string) {
  void globalMutate(["workout", workoutId, userId]);
}

/** 레이스 맥락에서 특정 운동 상세 (타인 기록도 포함) */
export function useChallengeWorkoutDetail(
  workoutId: number | null,
  challengeId: number | null,
  user: User | null,
) {
  return useSWR(
    user && workoutId != null && challengeId != null
      ? (["challenge-workout", challengeId, workoutId, user.uid] as const)
      : null,
    () => fetchChallengeWorkout(challengeId!, workoutId!, user!),
    BASE_CONFIG,
  );
}

/** 공개 공유 페이지용 운동 데이터 (인증 불필요, id 변경 시 재요청). */
export function useWorkoutShare(id: number | null) {
  return useSWR(
    id != null ? (["workout-share", id] as const) : null,
    () => fetchWorkoutShare(id!),
    { ...BASE_CONFIG, revalidateOnFocus: false },
  );
}

// ── 내 정보 (닉네임 포함) ────────────────────────────────────────────────────
export function useMe(user: User | null) {
  return useSWR(
    user ? (["me", user.uid] as const) : null,
    () => fetchMe(user!),
    BASE_CONFIG,
  );
}
