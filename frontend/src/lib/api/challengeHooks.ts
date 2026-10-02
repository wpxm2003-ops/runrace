/**
 * SWR 기반 데이터 훅 모음.
 * stale-while-revalidate — 캐시된 데이터를 즉시 보여주고 백그라운드에서 갱신한다.
 * 쓰기(참여/투표/기록 등) 후에는 각 invalidate* 헬퍼로 즉시 재검증한다.
 */
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import { appMutate, getAppCacheKeys } from "@/lib/swrMutate";
import type { User } from "firebase/auth";
import type { ChallengeDetail } from "./types";
import {
  removeChallengeFromListCaches,
  revalidateChallengeInfiniteListCaches,
} from "@/lib/challengeListCache";
import {
  fetchChallengesPage,
  fetchChallengeDetail,
  fetchActiveCount,
  fetchMyChallengesPage,
  fetchChallengeWorkouts,
  fetchHeadToHead,
  fetchPendingApprovals,
  fetchRejectedApprovals,
  DEFAULT_PAGE_SIZE,
} from "./challenges";
import { fetchPrizes } from "./prizes";
import {
  BASE_CONFIG,
  cacheUid,
  invalidateByPrefix,
  LIVE_CONFIG,
  SWR_INFINITE_CONFIG,
} from "./hookConfig";

// ── 레이스 목록 ────────────────────────────────────────────────────────────────
/**
 * 공개 API이지만 로그인 여부에 따라 뷰어 종속 필드(목록의 isMember 참여중 배지,
 * 상세의 showManage)가 달라지므로 userId를 키에 포함한다.
 * 비로그인 상태에서도 목록 자체는 즉시 보여준다.
 */
/**
 * 공개 레이스 목록 — phase 필터별 무한스크롤. 페이지 끝(hasNext=false)에 도달하면 추가 키를 만들지 않는다.
 * 필터/언어 변경 시 호출 측에서 setSize(1)로 첫 페이지부터 다시 로드한다.
 */
const PUBLIC_PAGE_SIZE = DEFAULT_PAGE_SIZE;

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
    // 인증 복원 등으로 키가 바뀌어도 persistSize로 불러온 페이지 수를 유지해 스크롤 복원이 깨지지 않게 한다.
    SWR_INFINITE_CONFIG,
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
    SWR_INFINITE_CONFIG,
  );
}

/** 레이스 상세 폴링 주기 — 진행 중(hasStarted && !hasEnded)일 때만, livePoll 옵트인 화면에서. */
const CHALLENGE_DETAIL_POLL_MS = 60_000;

// ── 레이스 상세 ────────────────────────────────────────────────────────────────
/**
 * livePoll=true면 진행 중인 레이스일 동안 CHALLENGE_DETAIL_POLL_MS마다 재검증한다
 * (실시간 진행률·liveActive 뱃지 반영용). 기본 false — 상세 페이지 외 다른 화면(수정 폼 등)은
 * 기존처럼 폴링하지 않는다.
 */
export function useChallengeDetail(id: number | null, user?: User | null, livePoll = false) {
  const uid = cacheUid(user);
  return useSWR(
    id == null ? null : (["challenge", id, uid] as const),
    () => fetchChallengeDetail(id!, user),
    {
      ...LIVE_CONFIG,
      // preload(onPointerDown)로 시작된 in-flight 요청을 재활용할 수 있도록 dedup 허용.
      // LIVE_CONFIG의 0은 매 진입마다 새 요청을 강제하지만 preload와 충돌한다.
      dedupingInterval: 3000,
      refreshInterval: livePoll
        ? (data: ChallengeDetail | undefined) =>
            data?.hasStarted && !data?.hasEnded ? CHALLENGE_DETAIL_POLL_MS : 0
        : 0,
    },
  );
}

/**
 * 레이스 목록(공개·내 레이스) 무한스크롤 캐시 무효화 — 생성/참여/탈퇴/삭제 후 호출.
 * 데이터를 비우지 않고 백그라운드 재검증만 한다(stale-while-revalidate).
 * 비우면 뒤로가기로 목록에 돌아왔을 때 캐시가 없어 스켈레톤이 다시 뜬다.
 */
export function invalidateChallengeLists() {
  void revalidateChallengeInfiniteListCaches(appMutate, getAppCacheKeys(), [
    "challenges-page",
    "challenges-mine-page",
  ]);
}

/** Remove a race confirmed missing by the detail API from every list cache immediately. */
export function removeChallengeFromCachedLists(challengeId: number) {
  return removeChallengeFromListCaches(appMutate, getAppCacheKeys(), challengeId);
}

/**
 * 404 확정된 레이스의 상세 캐시 제거. SWR은 fetch가 실패해도 이전 성공 데이터를 유지하므로,
 * 이걸 비우지 않으면 삭제된 레이스의 상세·관리 버튼이 화면에 계속 남는다.
 */
export function clearChallengeDetailCache(challengeId: number) {
  return appMutate(
    (key) => Array.isArray(key) && key[0] === "challenge" && key[1] === challengeId && key.length === 3,
    undefined,
    { revalidate: false },
  );
}

/** 레이스 참여자 운동기록 목록을 갱신한다 (실내러닝 승인 반영 후). */
export function invalidateChallengeWorkouts(challengeId: number, userId: string) {
  return appMutate(["challenge", challengeId, "workouts", userId]);
}

/** 레이스 경품 목록 — S3 키는 응답에 없다(uid로는 사용자별 캐시 분리만 한다). */
export function usePrizes(challengeId: number | null, user?: User | null) {
  const uid = cacheUid(user);
  return useSWR(
    challengeId == null ? null : (["prizes", challengeId, uid] as const),
    () => fetchPrizes(challengeId!, user ?? null),
    BASE_CONFIG,
  );
}

/** 경품 저장 후 해당 레이스의 경품 캐시를 재검증한다. */
export function invalidatePrizes(challengeId: number) {
  invalidateByPrefix("prizes", challengeId);
}

/**
 * 내 닉네임이 실제로 담기는 캐시의 키 접두사.
 *
 * 레이스 목록(challenges-page·challenges-mine-page)은 여기 없다 — ChallengeListItem에
 * 닉네임 필드가 아예 없다. (예전 코드는 존재하지 않는 "challenges" 접두사를 검사해
 * 아무것도 무효화하지 못했다. 접두사를 고치는 게 아니라 뺀 이유가 이것이다.)
 * 라이벌 목록도 제외 — 상대 닉네임만 담아 내 변경과 무관하다.
 */
const NICKNAME_BEARING_PREFIXES = new Set([
  "me", // 내 정보
  "challenge", // 순위표·참여자 운동기록·승인 목록 (uid가 2~3번째 자리)
  "crew-me", // 크루 월간 보드의 내 행
  "crew-insights", // 명예의 전당·잔디 닉네임
  "crew-detail", // 공개 크루 상세의 leaderNickname
  "crew-match", // 대항전 로스터 닉네임
]);

/** 닉네임 변경 후 내 닉네임이 노출되는 SWR 캐시를 재검증한다. */
export function invalidateAfterNicknameChange(userId: string) {
  void appMutate(
    (key) => {
      if (!Array.isArray(key)) return false;
      const head = key[0];
      // uid가 키의 몇 번째에 오는지는 훅마다 다르므로(2번째·3번째·4번째) 포함 여부로 본다.
      return typeof head === "string"
        && NICKNAME_BEARING_PREFIXES.has(head)
        && key.includes(userId);
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
  const uid = cacheUid(user, "public");
  return useSWR(
    challengeId != null
      ? (["challenge", challengeId, "workouts", uid] as const)
      : null,
    () => fetchChallengeWorkouts(challengeId!, user),
    BASE_CONFIG,
  );
}

/**
 * challengeId·user·enabled 게이트를 공유하는 레이스 스코프 리소스 훅 공통화.
 * (head-to-head·실내러닝 승인대기/반려 목록이 동일한 키·게이트 shape를 반복해 추출.)
 */
function useGatedChallengeResource<T>(
  challengeId: number | null,
  user: User | null,
  enabled: boolean,
  segment: string,
  fetcher: (challengeId: number, user: User) => Promise<T>,
) {
  return useSWR(
    enabled && challengeId != null && user
      ? (["challenge", challengeId, segment, user.uid] as const)
      : null,
    () => fetcher(challengeId!, user!),
    BASE_CONFIG,
  );
}

/** 종료된 레이스 — 이 방의 라이벌 참여자와 나의 누적 전적. 종료 + 로그인 시에만 조회. */
export function useHeadToHead(
  challengeId: number | null,
  user: User | null,
  enabled: boolean,
) {
  return useGatedChallengeResource(challengeId, user, enabled, "head-to-head", fetchHeadToHead);
}

// ── 실내러닝 승인 (레이스 참여·시작 후에만) ──────────────────────────────────
export function usePendingApprovals(
  challengeId: number | null,
  user: User | null,
  enabled: boolean,
) {
  return useGatedChallengeResource(
    challengeId, user, enabled, "pending-approvals", fetchPendingApprovals,
  );
}

export function useRejectedApprovals(
  challengeId: number | null,
  user: User | null,
  enabled: boolean,
) {
  return useGatedChallengeResource(
    challengeId, user, enabled, "rejected-approvals", fetchRejectedApprovals,
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
