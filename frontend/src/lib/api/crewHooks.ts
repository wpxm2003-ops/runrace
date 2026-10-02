import type { User } from "firebase/auth";
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import { revalidateChallengeInfiniteListCaches } from "@/lib/challengeListCache";
import { appMutate, getAppCacheKeys } from "@/lib/swrMutate";
import { DEFAULT_PAGE_SIZE, fetchCrewRaces, fetchCrewRacesPage } from "./challenges";
import {
  fetchCrewDetail,
  fetchCrewDiscovery,
  fetchCrewInsights,
  fetchCrewMatchDetail,
  fetchCrewMatchHistory,
  fetchLeaderJoinRequests,
  fetchMyApplications,
  fetchMyCrew,
  fetchMyCrewMatches,
  searchCrews,
} from "./crews";
import {
  BASE_CONFIG,
  cacheUid,
  COLD_CONFIG,
  invalidateByPrefix,
  LIVE_CONFIG,
  SWR_INFINITE_CONFIG,
} from "./hookConfig";
import type { CrewRegion } from "./types";

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

/** 크루 검색(도전장 상대 선택) — 쿼리별 캐시. */
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

/** 공개 크루 상세 — 비회원도 조회 가능. */
export function useCrewDetail(crewId: number | null, user: User | null | undefined) {
  const uid = cacheUid(user, "public");
  return useSWR(
    crewId != null ? (["crew-detail", crewId, uid] as const) : null,
    () => fetchCrewDetail(crewId!, user),
    LIVE_CONFIG,
  );
}

export function invalidateCrewDetail(crewId: number) {
  invalidateByPrefix("crew-detail", crewId);
}

export function useLeaderJoinRequests(user: User | null, enabled: boolean) {
  return useSWR(
    enabled && user ? (["crew-join-requests", user.uid] as const) : null,
    () => fetchLeaderJoinRequests(user!),
    LIVE_CONFIG,
  );
}

export function invalidateLeaderJoinRequests(userId: string) {
  invalidateByPrefix("crew-join-requests", userId);
}

export function useMyApplications(user: User | null) {
  return useSWR(
    user ? (["crew-my-applications", user.uid] as const) : null,
    () => fetchMyApplications(user!),
    LIVE_CONFIG,
  );
}

export function invalidateMyApplications(userId: string) {
  invalidateByPrefix("crew-my-applications", userId);
}
