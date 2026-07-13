import type { User } from "firebase/auth";
import { apiFetch, publicFetch } from "./client";
import type { CrewInsights, CrewJoinInfo, CrewRecap, MyCrewResponse } from "./types";

/** 내 크루 홈(주간 보드 포함). 미소속이면 crew=null. */
export function fetchMyCrew(user: User) {
  return apiFetch<MyCrewResponse>("/api/crews/me", { user });
}

/** 초대 랜딩 정보 — 비로그인도 조회 가능(로그인 시 소속 상태 포함). */
export function fetchCrewJoinInfo(code: string, user?: User | null) {
  return publicFetch<CrewJoinInfo>(
    `/api/crews/join-info?code=${encodeURIComponent(code)}`,
    user,
  );
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
