import type { User } from "firebase/auth";
import { apiFetch, publicFetch } from "./client";
import type {
  CrewInsights,
  CrewDetail,
  CrewJoinRequestRow,
  CrewMatchDetail,
  CrewMatchHistoryPage,
  CrewProfileBody,
  CrewRecap,
  CrewRegion,
  CrewSearchItem,
  CrewDiscoveryResponse,
  MyApplicationRow,
  MyCrewMatches,
  MyCrewResponse,
} from "./types";

/** 내 크루 홈(주간 보드 포함). 미소속이면 crew=null. */
export function fetchMyCrew(user: User) {
  return apiFetch<MyCrewResponse>("/api/crews/me", { user });
}

/** 크루 생성 — 생성자가 리더가 된다(1인 1크루). 지역은 발견 필터의 기준이라 필수. */
export function createCrew(name: string, region: CrewRegion, user: User) {
  return apiFetch<void>("/api/crews", { method: "POST", user, body: { name, region } });
}

/** 초대 코드로 가입. */
export function joinCrew(code: string, user: User) {
  return apiFetch<void>("/api/crews/join", { method: "POST", user, body: { code } });
}

/** 크루 탈퇴(리더는 불가 — 해체만 가능). */
export function leaveCrew(user: User) {
  return apiFetch<void>("/api/crews/leave", { method: "POST", user });
}

/** 이름·공지·주간 목표 수정(리더 전용). */
export function updateCrew(
  crewId: number,
  body: { notice: string | null; weekGoalKm: number | null },
  user: User,
) {
  return apiFetch<void>(`/api/crews/${crewId}`, { method: "PATCH", user, body });
}

/** 지난주 크루 결산 — 홈 결산 섹션 + 공유 카드용. */
export function fetchCrewRecap(user: User) {
  return apiFetch<CrewRecap>("/api/crews/me/recap", { user });
}

/** 크루 잔디 + 명예의 전당. */
export function fetchCrewInsights(user: User) {
  return apiFetch<CrewInsights>("/api/crews/me/insights", { user });
}

/** 같은 크루 멤버에게 콕 찌르기(하루 1회, 레이스 넛지와 공용 제한). */
export function crewNudge(targetUserId: string, variant: number, user: User) {
  return apiFetch<void>(`/api/crews/nudge/${targetUserId}`, {
    method: "POST",
    body: { variant },
    user,
  });
}

/** 크루 해체(리더 전용). */
export function disbandCrew(crewId: number, user: User) {
  return apiFetch<void>(`/api/crews/${crewId}`, { method: "DELETE", user });
}

/** 멤버 내보내기(리더 전용). */
export function kickCrewMember(crewId: number, memberUserId: string, user: User) {
  return apiFetch<void>(`/api/crews/${crewId}/members/${memberUserId}`, {
    method: "DELETE",
    user,
  });
}

/** 크루 검색(도전장 상대 선택) — 내 크루 제외, 멤버 많은 순 상위 30개. */
export function searchCrews(query: string, user: User) {
  return apiFetch<CrewSearchItem[]>(
    `/api/crews/search?query=${encodeURIComponent(query)}`,
    { user },
  );
}

/**
 * 멤버가 많은 순서의 크루 탐색 목록(10개 단위) — 비회원도 조회 가능.
 * region 생략/빈 문자열=전체. 로그인 상태면 저장된 토큰/user로 인증 헤더를 실어 보낸다(공개 응답은 동일).
 */
export function fetchCrewDiscovery(region: CrewRegion | "", page: number, user?: User | null) {
  const q = region ? `region=${region}&page=${page}` : `page=${page}`;
  return publicFetch<CrewDiscoveryResponse>(`/api/crews/discover?${q}`, user);
}

/** 공개 크루 상세 — 비회원도 조회 가능. 로그인 상태면 내 신청 상태(대기중/쿨다운)를 함께 받는다. */
export function fetchCrewDetail(crewId: number, user?: User | null) {
  return publicFetch<CrewDetail>(`/api/crews/${crewId}`, user);
}

/** 발견 프로필(지역·이미지·소개·정기런) 수정(리더 전용). */
export function updateCrewProfile(crewId: number, body: CrewProfileBody, user: User) {
  return apiFetch<void>(`/api/crews/${crewId}/profile`, { method: "PATCH", user, body });
}

// ── 가입신청(승인제) ─────────────────────────────────────────────

/** 발견 목록에서 가입 신청 — 한마디는 선택. */
export function applyToCrew(crewId: number, message: string | null, user: User) {
  return apiFetch<void>(`/api/crews/${crewId}/apply`, { method: "POST", user, body: { message } });
}

/** 가입 신청 승인(리더 전용). */
export function approveJoinRequest(requestId: number, user: User) {
  return apiFetch<void>(`/api/crews/join-requests/${requestId}/approve`, { method: "POST", user });
}

/** 가입 신청 거절(리더 전용) — 사유는 선택. */
export function rejectJoinRequest(requestId: number, reason: string | null, user: User) {
  return apiFetch<void>(`/api/crews/join-requests/${requestId}/reject`, {
    method: "POST",
    user,
    body: { reason },
  });
}

/** 가입 신청 철회(신청자 본인). */
export function cancelJoinRequest(requestId: number, user: User) {
  return apiFetch<void>(`/api/crews/join-requests/${requestId}/cancel`, { method: "POST", user });
}

/** 리더 인박스 — 내 크루의 대기중 가입신청 전체. */
export function fetchLeaderJoinRequests(user: User) {
  return apiFetch<CrewJoinRequestRow[]>("/api/crews/me/join-requests", { user });
}

/** 내 신청 현황 — 대기중인 가입신청 전체(크루 미소속 홈에서 노출). */
export function fetchMyApplications(user: User) {
  return apiFetch<MyApplicationRow[]>("/api/crews/my-applications", { user });
}

// ── 크루 대항전(C1) ───────────────────────────────────────────────

/**
 * 도전장 발송(리더 전용) — 선택 멤버 수가 곧 로스터 크기(상대도 동수).
 * startAt/endAt은 레이스 등록과 동일한 규칙으로 검증된다.
 */
export function createCrewMatch(
  body: {
    opponentCrewName: string;
    rosterSize: number;
    startAt: string;
    endAt: string;
    rosterUserIds: string[];
  },
  user: User,
) {
  return apiFetch<void>("/api/crew-matches", { method: "POST", user, body });
}

/** 크루 홈 대항전 섹션 — 전적 + 진행중 + 받은/보낸 도전장 + 최근 결과. */
export function fetchMyCrewMatches(user: User) {
  return apiFetch<MyCrewMatches>("/api/crew-matches/me", { user });
}

/** 크루가 주고받은 전체 대항전 내역 — 최신 신청 순 페이지. */
export function fetchCrewMatchHistory(page: number, user: User, size = 20) {
  return apiFetch<CrewMatchHistoryPage>(
    `/api/crew-matches/history?page=${page}&size=${size}`,
    { user },
  );
}

/** 대항전 상세(참가 크루 멤버만). */
export function fetchCrewMatchDetail(matchId: number, user: User) {
  return apiFetch<CrewMatchDetail>(`/api/crew-matches/${matchId}`, { user });
}

/** 도전장 수락(상대 크루 리더 전용) — 우리 로스터 지명 포함. */
export function acceptCrewMatch(matchId: number, rosterUserIds: string[], user: User) {
  return apiFetch<void>(`/api/crew-matches/${matchId}/accept`, {
    method: "POST",
    user,
    body: { rosterUserIds },
  });
}

/** 도전장 거절(상대 크루 리더 전용). */
export function declineCrewMatch(matchId: number, user: User) {
  return apiFetch<void>(`/api/crew-matches/${matchId}/decline`, { method: "POST", user });
}

/** 도전장 취소(도전 크루 리더 전용, 수락 전만). */
export function cancelCrewMatch(matchId: number, user: User) {
  return apiFetch<void>(`/api/crew-matches/${matchId}`, { method: "DELETE", user });
}
