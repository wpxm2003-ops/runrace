import type { User } from "firebase/auth";
import { apiFetch } from "./client";
import type { WeeklyGoalSaveBody, WeeklyGoalStatus } from "./types";

/** 홈 주간 목표 카드 — 목표·이번 주 진척·현재 연속 기록·추천값. */
export function fetchWeeklyGoal(user: User) {
  return apiFetch<WeeklyGoalStatus>("/api/weekly-goal", { user });
}

/** 주간 목표 저장(생성·수정 겸용). 저장 후 최신 상태를 돌려준다. */
export function saveWeeklyGoal(body: WeeklyGoalSaveBody, user: User) {
  return apiFetch<WeeklyGoalStatus>("/api/weekly-goal", { method: "PUT", user, body });
}
