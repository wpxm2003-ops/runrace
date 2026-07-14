import type { User } from "firebase/auth";
import { apiFetch } from "./client";
import type {
  CrewInsights,
  CrewMatchDetail,
  CrewRecap,
  CrewSearchItem,
  MyCrewMatches,
  MyCrewResponse,
} from "./types";

/** 내 크루 홈(주간 보드 포함). 미소속이면 crew=null. */
export function fetchMyCrew(user: User) {
  return apiFetch<MyCrewResponse>("/api/crews/me", { user });
}

/** 크루 생성 — 생성자가 리더가 된다(1인 1크루). */
export function createCrew(name: string, user: User) {
  return apiFetch<void>("/api/crews", { method: "POST", user, body: { name } });
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
  body: { name: string; notice: string | null; weekGoalKm: number | null },
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
