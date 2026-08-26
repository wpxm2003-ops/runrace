/**
 * SWR 기반 데이터 훅 모음.
 * stale-while-revalidate — 캐시된 데이터를 즉시 보여주고 백그라운드에서 갱신한다.
 * 쓰기(참여/투표/기록 등) 후에는 각 invalidate* 헬퍼로 즉시 재검증한다.
 */
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import { appMutate, getAppCacheKeys } from "@/lib/swrMutate";
import type { User } from "firebase/auth";
import type { ChallengeDetail, CrewRegion, WorkoutDetail } from "./types";
import {
  removeChallengeFromListCaches,
  revalidateChallengeInfiniteListCaches,
} from "@/lib/challengeListCache";
import { reportClientError } from "./errors";
import {
  fetchChallengesPage,
  fetchChallengeDetail,
  fetchActiveCount,
  fetchMyChallengesPage,
  fetchChallengeWorkouts,
  fetchCrewRaces,
  fetchCrewRacesPage,
  fetchHeadToHead,
  fetchLiveProgressSetting,
  fetchPendingApprovals,
  fetchRejectedApprovals,
  DEFAULT_PAGE_SIZE,
} from "./challenges";
import {
  fetchMyCrew,
  fetchCrewInsights,
  fetchMyCrewMatches,
  fetchCrewMatchDetail,
  fetchCrewMatchHistory,
  fetchCrewDiscovery,
  fetchCrewDetail,
  fetchLeaderJoinRequests,
  fetchMyApplications,
  searchCrews,
} from "./crews";
import { fetchPrizes } from "./prizes";
import { fetchRivals } from "./rivals";
import { fetchShoes } from "./shoes";
import { fetchNsmBlockReport, fetchNsmMyReport, fetchNsmWeeklyProgress, fetchTrainingPlan } from "./training";
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

/** 캐시 키용 uid — 로그인 uid → 저장 토큰 uid → 익명 폴백(기본 null). */
function cacheUid(user?: User | null, anonymous: string | null = null): string | null {
  return user?.uid ?? getStoredAuthUid() ?? anonymous;
}

/** [prefix, id, ...] 키 캐시 무효화. id 생략 시 prefix 전체. */
function invalidateByPrefix(prefix: string, id?: string | number) {
  void appMutate(
    (key) => Array.isArray(key) && key[0] === prefix && (id === undefined || key[1] === id),
  );
}

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

/**
 * 포커스 복귀 재검증이 필요 없는(변화가 드물거나 공개 스냅샷인) 훅용 설정.
 * BASE_CONFIG도 현재 revalidateOnFocus:false지만, 여기는 그 값이 계약이라 명시적으로 고정한다.
 */
const COLD_CONFIG = { ...BASE_CONFIG, revalidateOnFocus: false };

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

/** useSWRInfinite 목록 훅 5곳 공용 — 필터/언어 변경 시 setSize(1)로 재시작, persistSize로 스크롤 복원 유지. */
const SWR_INFINITE_CONFIG = {
  revalidateFirstPage: true,
  revalidateOnFocus: true,
  keepPreviousData: true,
  persistSize: true,
  dedupingInterval: 0,
  ...SWR_ERROR_RETRY,
};

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

// ── 라이벌 ───────────────────────────────────────────────────────────────────
export function useRivals(user: User | null) {
  return useSWR(
    user ? (["rivals", user.uid] as const) : null,
    () => fetchRivals(user!),
    BASE_CONFIG,
  );
}

// ── 크루 ─────────────────────────────────────────────────────────────────────
/** 내 크루 홈(주간 보드 포함). 미소속이면 data.crew === null. */
export function useMyCrew(user: User | null) {
  return useSWR(
    user ? (["crew-me", user.uid] as const) : null,
    () => fetchMyCrew(user!),
    BASE_CONFIG,
  );
}

/** 크루 생성/가입/탈퇴/수정/멤버 변경 후 크루 홈 재검증. */
export function invalidateMyCrew(userId: string) {
  invalidateByPrefix("crew-me", userId);
}

/** 크루 잔디 + 명예의 전당 — 크루 소속일 때만 조회(enabled). */
export function useCrewInsights(user: User | null, enabled: boolean) {
  return useSWR(
    enabled && user ? (["crew-insights", user.uid] as const) : null,
    () => fetchCrewInsights(user!),
    COLD_CONFIG,
  );
}

/** 내 크루의 내부 레이스 목록 — 크루 홈 섹션용. */
export function useCrewRaces(user: User | null, enabled: boolean) {
  return useSWR(
    enabled && user ? (["crew-races", user.uid, "home"] as const) : null,
    () => fetchCrewRaces(user!),
    LIVE_CONFIG,
  );
}

/** 크루 레이스 전체보기 — 예정·진행중/종료 탭별 무한스크롤. */
export function useCrewRaceListInfinite(user: User | null, phase: string) {
  return useSWRInfinite(
    (index, previous) => {
      if (!user || (previous && !previous.hasNext)) return null;
      return ["crew-races", user.uid, phase, index] as const;
    },
    (key) => fetchCrewRacesPage(user!, {
      phase,
      page: key[3] as number,
      size: DEFAULT_PAGE_SIZE,
    }),
    SWR_INFINITE_CONFIG,
  );
}

/** 크루 레이스 생성 후 크루 홈 레이스 목록 재검증. */
export function invalidateCrewRaces(userId: string) {
  const cacheKeys = getAppCacheKeys();
  void Promise.all([
    appMutate(
      (key) =>
        Array.isArray(key) &&
        key[0] === "crew-races" &&
        key[1] === userId &&
        key[2] === "home",
    ),
    revalidateChallengeInfiniteListCaches(appMutate, cacheKeys, ["crew-races"]),
  ]);
}

/** 크루 홈 대항전 섹션 — 크루 소속일 때만 조회(enabled). */
export function useMyCrewMatches(user: User | null, enabled: boolean) {
  return useSWR(
    enabled && user ? (["crew-matches", user.uid] as const) : null,
    () => fetchMyCrewMatches(user!),
    LIVE_CONFIG,
  );
}

/** 역대 크루 대항전 내역 — 최신 신청 순 무한스크롤. */
export function useCrewMatchHistoryInfinite(user: User | null) {
  return useSWRInfinite(
    (index, previous) => {
      if (!user || (previous && !previous.hasNext)) return null;
      return ["crew-match-history", user.uid, index] as const;
    },
    (key) => fetchCrewMatchHistory(key[2] as number, user!),
    SWR_INFINITE_CONFIG,
  );
}

/** 대항전 상세 — 진행 중엔 점수가 계속 변하므로 LIVE 설정. */
export function useCrewMatchDetail(matchId: number | null, user: User | null) {
  return useSWR(
    user && matchId != null ? (["crew-match", matchId, user.uid] as const) : null,
    () => fetchCrewMatchDetail(matchId!, user!),
    LIVE_CONFIG,
  );
}

/** 도전장 발송/수락/거절/취소 후 대항전 캐시 재검증. */
export function invalidateCrewMatches(userId: string) {
  invalidateByPrefix("crew-matches", userId);
  invalidateByPrefix("crew-match");
  invalidateByPrefix("crew-match-history", userId);
}

/** 크루 검색(도전장 상대 선택) — 쿼리별 캐시. enabled=false면(검색어 없음 등) 조회하지 않는다. */
export function useCrewSearch(query: string, user: User | null, enabled: boolean) {
  return useSWR(
    enabled && user ? (["crew-search", query, user.uid] as const) : null,
    () => searchCrews(query, user!),
    { ...BASE_CONFIG, keepPreviousData: true },
  );
}

/** 크루 발견 목록 — 지역 필터별 무한스크롤. 비회원도 조회 가능(공개). */
export function useCrewDiscoveryInfinite(region: CrewRegion | "", user: User | null | undefined) {
  return useSWRInfinite(
    (index, previous) => {
      if (previous && !previous.hasMore) return null;
      return ["crew-discovery", region, index] as const;
    },
    (key) => fetchCrewDiscovery(key[1] as CrewRegion | "", key[2] as number, user),
    { ...SWR_INFINITE_CONFIG, revalidateOnFocus: false },
  );
}

/** 공개 크루 상세 — 비회원도 조회 가능. id 변경 시 재요청. */
export function useCrewDetail(crewId: number | null, user: User | null | undefined) {
  const uid = cacheUid(user, "public");
  return useSWR(
    crewId != null ? (["crew-detail", crewId, uid] as const) : null,
    () => fetchCrewDetail(crewId!, user),
    LIVE_CONFIG,
  );
}

/** 가입신청/취소 후 크루 상세(대기중·쿨다운 상태)를 재검증한다. */
export function invalidateCrewDetail(crewId: number) {
  invalidateByPrefix("crew-detail", crewId);
}

/** 리더 인박스 — 내 크루의 대기중 가입신청. 크루 소속(리더)일 때만 조회(enabled). */
export function useLeaderJoinRequests(user: User | null, enabled: boolean) {
  return useSWR(
    enabled && user ? (["crew-join-requests", user.uid] as const) : null,
    () => fetchLeaderJoinRequests(user!),
    LIVE_CONFIG,
  );
}

/** 승인/거절 후 리더 인박스 재검증. */
export function invalidateLeaderJoinRequests(userId: string) {
  invalidateByPrefix("crew-join-requests", userId);
}

/** 내 신청 현황(대기중 전체) — 크루 미소속 홈에서 노출. */
export function useMyApplications(user: User | null) {
  return useSWR(
    user ? (["crew-my-applications", user.uid] as const) : null,
    () => fetchMyApplications(user!),
    LIVE_CONFIG,
  );
}

/** 신청/취소/타 크루 승인(자동취소) 후 내 신청 현황 재검증. */
export function invalidateMyApplications(userId: string) {
  invalidateByPrefix("crew-my-applications", userId);
}

// ── 신발장 ───────────────────────────────────────────────────────────────────
export function useShoes(user: User | null) {
  return useSWR(
    user ? (["shoes", user.uid] as const) : null,
    () => fetchShoes(user!),
    BASE_CONFIG,
  );
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

// ── 운동 기록 ─────────────────────────────────────────────────────────────────
/** 내 활성 NSM 훈련 플랜. */
export function useTrainingPlan(user: User | null) {
  return useSWR(
    user ? (["training-plan", user.uid] as const) : null,
    () => fetchTrainingPlan(user!),
    BASE_CONFIG,
  );
}

/** 이번 주 sub-T 진척 — NSM 코치 화면의 "이번 주 N/M 완료" 표시용. */
export function useNsmWeeklyProgress(user: User | null) {
  return useSWR(
    user ? (["nsm-weekly-progress", user.uid] as const) : null,
    () => fetchNsmWeeklyProgress(user!),
    BASE_CONFIG,
  );
}

/** 내 NSM 성장 리포트(역치 추이 + 누적) — /training/report 대시보드용. */
export function useNsmMyReport(user: User | null) {
  return useSWR(
    user ? (["nsm-my-report", user.uid] as const) : null,
    () => fetchNsmMyReport(user!),
    BASE_CONFIG,
  );
}

/** NSM 블록 공개 리포트 — 인증 불필요, 공유 링크로 조회(id 변경 시 재요청). */
export function useNsmBlockReport(id: number | null) {
  return useSWR(
    id != null ? (["nsm-block-report", id] as const) : null,
    () => fetchNsmBlockReport(id!),
    COLD_CONFIG,
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
  void appMutate(["workouts", "summary", userId]);
  if (year != null) {
    void appMutate(["workouts", userId, year]);
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
  void appMutate(["workout", workoutId, userId]);
}

/**
 * 운동 상세 캐시의 사진(imageUrl)을 즉시 확정 갱신한다.
 * PATCH 성공 직후 호출하므로 우리가 쓴 값이 진실 — 재검증으로 덮어쓰지 않는다
 * (GET 응답이 느리거나 일시적으로 옛 값을 줄 때 UI가 되돌아가는 것 방지).
 */
export function patchWorkoutDetailImage(workoutId: number, userId: string, imageUrl: string | null) {
  void appMutate(
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
    COLD_CONFIG,
  );
}

/** 공개 공유 페이지용 운동 데이터 (인증 불필요, id 변경 시 재요청). */
export function useWorkoutShare(id: number | null) {
  return useSWR(
    id != null ? (["workout-share", id] as const) : null,
    () => fetchWorkoutShare(id!),
    COLD_CONFIG,
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
    COLD_CONFIG,
  );
}

/** 실시간 진행률 공유 설정(공개/크루 두 축) — 내정보 토글용. */
export function useLiveProgressSetting(user: User | null) {
  return useSWR(
    user ? (["live-progress-setting", user.uid] as const) : null,
    () => fetchLiveProgressSetting(user!),
    COLD_CONFIG,
  );
}
