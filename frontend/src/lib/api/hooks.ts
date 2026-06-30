/**
 * SWR 기반 데이터 훅 모음.
 * stale-while-revalidate — 캐시된 데이터를 즉시 보여주고 백그라운드에서 갱신한다.
 * 쓰기(참여/투표/기록 등) 후에는 각 invalidate* 헬퍼로 즉시 재검증한다.
 */
import useSWR, { mutate as globalMutate, unstable_serialize } from "swr";
import useSWRInfinite from "swr/infinite";
import type { User } from "firebase/auth";
import type { WorkoutDetail } from "./types";
import { reportClientError } from "./errors";
import {
  fetchChallengesPage,
  fetchChallengeDetail,
  fetchActiveCount,
  fetchMyChallengesPage,
  fetchChallengeWorkouts,
  fetchHeadToHead,
  fetchPendingApprovals,
  fetchRejectedApprovals,
} from "./challenges";
import { fetchRivals } from "./rivals";
import { fetchShoes } from "./shoes";
import { fetchTrainingPlan } from "./training";
import { fetchWorkout, fetchWorkoutComparison, fetchWorkoutShare, fetchWorkoutSummary, fetchWorkoutsByYear, fetchPersonalBests } from "./workouts";
import { fetchMe } from "./auth";
import { fetchNotificationSetting } from "./push";
import { SWR_ERROR_RETRY } from "./swrConfig";
import { getStoredAuthUid } from "@/lib/accessToken";

const onSwrError = (error: unknown) => {
  void reportClientError({
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? (error.stack ?? null) : null,
    kind: "swr",
  });
};

const BASE_CONFIG = {
  /** 진입 시 항상 백그라운드 재검증하되, 그동안 캐시된 데이터를 먼저 보여준다. */
  revalidateOnMount: true,
  revalidateOnFocus: false,
  /** 탭 전환·연도 변경 시 스켈레톤 깜빡임 없이 이전 데이터를 유지하며 갱신 */
  keepPreviousData: true,
  /** 짧은 시간 내 동일 키 재요청 방지(이중 마운트·연속 내비게이션) */
  dedupingInterval: 3000,
  onError: onSwrError,
  ...SWR_ERROR_RETRY,
};

/** 레이스 목록·상세·내정보처럼 항상 최신 데이터가 필요한 훅용 설정. */
const LIVE_CONFIG = {
  revalidateOnMount: true,
  revalidateOnFocus: true,
  keepPreviousData: true,
  /** 중복 요청 방지 구간을 0으로 → 페이지 진입마다 반드시 새로 fetch */
  dedupingInterval: 0,
  onError: onSwrError,
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
  lang: string | undefined,
  phase: string,
  waitForAuth = false,
) {
  // 비로그인(익명)이면 인증 복원을 기다리지 않고 즉시 fetch한다.
  // 직전 로그인 기록이 있는 사용자는 waitForAuth로 인증 복원까지 기다렸다가 단 한 번
  // user.uid가 채워진 키로 fetch한다 — 익명→로그인 재요청으로 "참여중" 라벨이 깜빡이거나
  // useSWRInfinite의 size가 리셋(스크롤 복원 깨짐)되는 것을 막는다.
  return useSWRInfinite(
    (index, previous) => {
      if (waitForAuth) return null;
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
      revalidateFirstPage: true,
      revalidateOnFocus: true,
      keepPreviousData: true,
      // 인증 복원 등으로 키가 바뀌어도 불러온 페이지 수를 유지해 스크롤 복원이 깨지지 않게 한다.
      persistSize: true,
      dedupingInterval: 0,
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
      revalidateFirstPage: true,
      revalidateOnFocus: true,
      keepPreviousData: true,
      persistSize: true,
      dedupingInterval: 0,
      ...SWR_ERROR_RETRY,
    },
  );
}

// ── 레이스 상세 ────────────────────────────────────────────────────────────────
export function useChallengeDetail(id: number | null, user?: User | null) {
  const uid = user?.uid ?? getStoredAuthUid() ?? null;
  return useSWR(
    id == null ? null : (["challenge", id, uid] as const),
    () => fetchChallengeDetail(id!, user),
    {
      ...LIVE_CONFIG,
      // preload(onPointerDown)로 시작된 in-flight 요청을 재활용할 수 있도록 dedup 허용.
      // LIVE_CONFIG의 0은 매 진입마다 새 요청을 강제하지만 preload와 충돌한다.
      dedupingInterval: 3000,
    },
  );
}

/**
 * 레이스 목록(공개·내 레이스) 무한스크롤 캐시 무효화 — 생성/참여/탈퇴/삭제 후 호출.
 * 데이터를 비우지 않고 백그라운드 재검증만 한다(stale-while-revalidate).
 * 비우면 뒤로가기로 목록에 돌아왔을 때 캐시가 없어 스켈레톤이 다시 뜬다.
 */
export function invalidateChallengeLists() {
  void globalMutate(
    (key) =>
      Array.isArray(key) &&
      (key[0] === "challenges-page" || key[0] === "challenges-mine-page"),
  );
}

/** 레이스 참여자 운동기록 목록을 갱신한다 (실내러닝 승인 반영 후). */
export function invalidateChallengeWorkouts(challengeId: number, userId: string) {
  return globalMutate(unstable_serialize(["challenge", challengeId, "workouts", userId]));
}

/** 닉네임 변경 후 닉네임이 노출되는 SWR 캐시를 재검증한다. */
export function invalidateAfterNicknameChange(userId: string) {
  void globalMutate(
    (key) => {
      if (!Array.isArray(key)) return false;
      const [head, a, b, c] = key;
      if (head === "me" && a === userId) return true;
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
) {
  // 참여자 운동 목록은 전체 공개 — 비참여자·비로그인도 조회한다(publicFetch).
  // 로그인 상태면 uid로 캐시 분리, 비로그인이면 "public" 키로 조회.
  const uid = user?.uid ?? getStoredAuthUid() ?? "public";
  return useSWR(
    challengeId != null
      ? (["challenge", challengeId, "workouts", uid] as const)
      : null,
    () => fetchChallengeWorkouts(challengeId!, user),
    BASE_CONFIG,
  );
}

/** 종료된 레이스 — 이 방의 라이벌 참여자와 나의 누적 전적. 종료 + 로그인 시에만 조회. */
export function useHeadToHead(
  challengeId: number | null,
  user: User | null,
  enabled: boolean,
) {
  return useSWR(
    enabled && challengeId != null && user
      ? (["challenge", challengeId, "head-to-head", user.uid] as const)
      : null,
    () => fetchHeadToHead(challengeId!, user!),
    BASE_CONFIG,
  );
}

// ── 라이벌 ───────────────────────────────────────────────────────────────────
export function useRivals(user: User | null) {
  return useSWR(
    user ? (["rivals", user.uid] as const) : null,
    () => fetchRivals(user!),
    BASE_CONFIG,
  );
}

/** 라이벌 등록/해제 후 목록 재검증. */
export function invalidateRivals(userId: string) {
  void globalMutate(
    (key) => Array.isArray(key) && key[0] === "rivals" && key[1] === userId,
  );
}

// ── 신발장 ───────────────────────────────────────────────────────────────────
export function useShoes(user: User | null) {
  return useSWR(
    user ? (["shoes", user.uid] as const) : null,
    () => fetchShoes(user!),
    BASE_CONFIG,
  );
}

/** 신발 등록/수정/삭제/활성화 후 목록 재검증. */
export function invalidateShoes(userId: string) {
  void globalMutate(
    (key) => Array.isArray(key) && key[0] === "shoes" && key[1] === userId,
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

// ── 운동 기록 ─────────────────────────────────────────────────────────────────
/** 내 활성 NSM 훈련 플랜. */
export function useTrainingPlan(user: User | null) {
  return useSWR(
    user ? (["training-plan", user.uid] as const) : null,
    () => fetchTrainingPlan(user!),
    BASE_CONFIG,
  );
}

/** 내 PB 목록 — NSM 페이스 자동 입력 등. */
export function usePersonalBests(user: User | null) {
  return useSWR(
    user ? (["personal-bests", user.uid] as const) : null,
    () => fetchPersonalBests(user!),
    BASE_CONFIG,
  );
}

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

/**
 * 운동 상세 캐시의 사진(imageUrl)을 즉시 확정 갱신한다.
 * PATCH 성공 직후 호출하므로 우리가 쓴 값이 진실 — 재검증으로 덮어쓰지 않는다
 * (GET 응답이 느리거나 일시적으로 옛 값을 줄 때 UI가 되돌아가는 것 방지).
 */
export function patchWorkoutDetailImage(workoutId: number, userId: string, imageUrl: string | null) {
  void globalMutate(
    ["workout", workoutId, userId],
    (cur?: WorkoutDetail) => (cur ? { ...cur, imageUrl } : cur),
    { revalidate: false },
  );
}

export function useWorkoutComparison(workoutId: number | null, user: User | null) {
  return useSWR(
    user && workoutId != null
      ? (["workout-comparison", workoutId, user.uid] as const)
      : null,
    () => fetchWorkoutComparison(workoutId!, user!),
    { ...BASE_CONFIG, revalidateOnFocus: false },
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
    LIVE_CONFIG,
  );
}

/** 푸시 알림 수신 설정 — 내정보 토글용 */
export function useNotificationSetting(user: User | null) {
  return useSWR(
    user ? (["notification-setting", user.uid] as const) : null,
    () => fetchNotificationSetting(user!),
    { ...BASE_CONFIG, revalidateOnFocus: false },
  );
}
