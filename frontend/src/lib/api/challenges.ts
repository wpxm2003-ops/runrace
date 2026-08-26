import type { User } from "firebase/auth";
import { apiFetch, publicFetch } from "./client";
import type {
  ActiveCount,
  ChallengeDetail,
  ChallengeFormBody,
  ChallengeListPage,
  ChallengeWorkoutListItem,
  CreatedId,
  HeadToHeadRow,
  LiveProgressResponse,
  LiveProgressSetting,
  PendingApproval,
  RejectedApproval,
} from "./types";

/** 레이스 목록 기본 페이지 크기. 훅(PUBLIC_PAGE_SIZE)과 공유. */
export const DEFAULT_PAGE_SIZE = 20;

/** 레이스 목록 쿼리스트링 직렬화. phase=all은 생략, size 기본값 적용. */
function buildPageQuery(opts: { lang?: string; phase?: string; page: number; size?: number }): string {
  const p = new URLSearchParams();
  if (opts.lang) p.set("lang", opts.lang);
  if (opts.phase && opts.phase !== "all") p.set("phase", opts.phase);
  p.set("page", String(opts.page));
  p.set("size", String(opts.size ?? DEFAULT_PAGE_SIZE));
  return p.toString();
}

/**
 * 공개 레이스 목록 — 페이지 단위(무한스크롤). 비로그인도 조회 가능(로그인 시 isOwner 채워짐).
 * phase: all|scheduled|in_progress|ended, lang 지정 시 해당 언어방만.
 */
export function fetchChallengesPage(
  user: User | null | undefined,
  opts: { lang?: string; phase?: string; page: number; size?: number },
) {
  return publicFetch<ChallengeListPage>(`/api/challenges?${buildPageQuery(opts)}`, user);
}

/** 내가 참여한 레이스 — 페이지 단위(무한스크롤). phase: all|active|ended. */
export function fetchMyChallengesPage(
  user: User,
  opts: { phase?: string; page: number; size?: number },
) {
  return apiFetch<ChallengeListPage>(`/api/challenges/mine?${buildPageQuery(opts)}`, { user });
}

/** 레이스 상세(공개). */
export function fetchChallengeDetail(id: number, user?: User | null) {
  return publicFetch<ChallengeDetail>(`/api/challenges/${id}`, user);
}

/** 내가 만든 진행 중 방 개수 / 상한. */
export function fetchActiveCount(user: User) {
  return apiFetch<ActiveCount>("/api/challenges/active-count", { user });
}

/** 종료된 레이스 — 이 방의 라이벌 참여자와 나의 누적 전적. */
export function fetchHeadToHead(id: number, user: User) {
  return apiFetch<HeadToHeadRow[]>(`/api/challenges/${id}/head-to-head`, { user });
}

export function createChallenge(body: ChallengeFormBody, user: User) {
  return apiFetch<CreatedId>("/api/challenges", { method: "POST", user, body });
}

/**
 * 크루 홈의 레이스 미리보기 — 예정·진행중 중 최대 5개만(전체는 "전체보기" → /crew/races).
 * 미소속이면 빈 배열.
 */
export function fetchCrewRaces(user: User) {
  return fetchCrewRacesPage(user, { phase: "active", page: 0, size: 5 })
    .then((page) => page.items);
}

/** 크루 내부 레이스 전체보기 — 상태별 페이지. */
export function fetchCrewRacesPage(
  user: User,
  opts: { phase: string; page: number; size?: number },
) {
  return apiFetch<ChallengeListPage>(
    `/api/challenges/crew/page?${buildPageQuery(opts)}`,
    { user },
  );
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

/**
 * 레이스 참여자만 — 레이스에 반영된 운동 목록.
 * publicFetch는 저장된 JWT를 우선 사용하므로 콜드 스타트(Firebase 초기화 전)에도 인증 fetch가 된다.
 */
export function fetchChallengeWorkouts(challengeId: number, user: User | null) {
  return publicFetch<ChallengeWorkoutListItem[]>(`/api/challenges/${challengeId}/workouts`, user);
}

/** 레이스 — 승인 대기 중인 실내러닝 목록 */
export function fetchPendingApprovals(challengeId: number, user: User) {
  return apiFetch<PendingApproval[]>(`/api/challenges/${challengeId}/pending-approvals`, { user });
}

/** 레이스 — 거부된 실내러닝 목록 */
export function fetchRejectedApprovals(challengeId: number, user: User) {
  return apiFetch<RejectedApproval[]>(`/api/challenges/${challengeId}/rejected-approvals`, { user });
}

// ── 실시간 진행률(live progress) ────────────────────────────────────
/**
 * 라이브 요청 타임아웃(ms). 이 요청들은 클라이언트에서 직렬 큐로 순서를 맞추기 때문에,
 * 응답 없는 요청 하나가 뒤에 줄 선 일시정지·종료 신호를 무한정 막을 수 있다
 * (모바일에서 소켓이 RST 없이 멈추면 fetch는 OS 타임아웃까지 pending이다).
 * 핑 주기(60초)보다 짧게 잡아 최악의 지연을 한 주기 안으로 묶는다.
 */
const LIVE_REQUEST_TIMEOUT_MS = 20_000;

/**
 * AbortSignal.timeout은 구형 WebView에 없을 수 있어 컨트롤러로 직접 만든다.
 * 요청이 먼저 끝나면 타이머를 해제한다 — 안 그러면 러닝 한 시간에 수십 개가 살아 남는다.
 */
function withLiveTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIVE_REQUEST_TIMEOUT_MS);
  return run(controller.signal).finally(() => clearTimeout(timer));
}

/**
 * 러닝 중 주기적 핑 — 호출자가 현재 진행 중인 GPS 러닝의 누적 거리(정지 전, 미저장)를 보내면,
 * 현재 활성 참여 중인 모든 챌린지에서 등록한 라이벌과의 실시간 격차를 받는다.
 * redirectOn401:false — 러닝 화면의 백그라운드 타이머라 JWT가 만료돼도 로그인 화면으로 튕기지 않는다.
 */
/**
 * @param sentAt 이 요청을 만든 시각(ms). 핑·일시정지·삭제가 같은 토큰을 쓰고 서버는 더 큰 값만
 *   받아들여, 셋 사이의 순서를 네트워크 재정렬과 무관하게 고정한다.
 */
export function postLiveProgress(
  distanceM: number,
  elapsedSec: number,
  sentAt: number,
  user: User,
) {
  return withLiveTimeout((signal) =>
    apiFetch<LiveProgressResponse>("/api/challenges/live-progress", {
      method: "POST",
      user,
      body: { distanceM, elapsedSec, sentAt },
      redirectOn401: false,
      signal,
    }),
  );
}

/**
 * 라이브 진행률 즉시 삭제 — 이번 런을 저장하지 않기로 확정된 순간에만 쓴다
 * (1m 미만 저장 취소, 경로 없음). 일시정지로 남겨 두면 뛰지도 않은 거리가 신선도 윈도(15분)
 * 동안 남았다가 뒤늦게 뚝 떨어진다.
 */
export function clearLiveProgress(user: User, sentAt: number) {
  return withLiveTimeout((signal) =>
    apiFetch<void>("/api/challenges/live-progress/discard", {
      method: "POST",
      user,
      body: { sentAt },
      redirectOn401: false,
      signal,
    }),
  );
}

/**
 * 라이브 진행률 일시정지 — 거리는 남기고 "러닝 중" 표시에서만 뺀다.
 * 운동을 멈추거나 끝낸 순간 남들 화면의 진행바가 뒤로 내려앉지 않게 한다. 다음 핑에 자동 해제.
 */
export function pauseLiveProgress(user: User, sentAt: number) {
  return withLiveTimeout((signal) =>
    apiFetch<void>("/api/challenges/live-progress/pause", {
      method: "POST",
      user,
      body: { sentAt },
      redirectOn401: false,
      signal,
    }),
  );
}

/** 실시간 진행률 공유 설정 조회 — push_enabled(notification-setting)와 같은 패턴. */
export function fetchLiveProgressSetting(user: User) {
  return apiFetch<LiveProgressSetting>("/api/me/live-progress-setting", { user });
}

/**
 * 실시간 진행률 공유 설정 저장 — 바꾸려는 축만 담아 보낸다.
 * 두 필드를 매번 함께 보내면 토글 하나를 누를 때 다른 축의 낡은 값까지 덮어쓴다.
 */
export function setLiveProgressSetting(user: User, patch: Partial<LiveProgressSetting>) {
  return apiFetch<void>("/api/me/live-progress-setting", {
    method: "PUT",
    user,
    body: patch,
  });
}
