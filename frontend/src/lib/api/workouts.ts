import type { User } from "firebase/auth";
import { apiFetch } from "./client";
import type {
  CreatedId,
  WorkoutCreateBody,
  WorkoutDetail,
  WorkoutListItem,
  WorkoutSummary,
} from "./types";

/** 내정보 — 전체 운동 기록 요약. */
export function fetchWorkoutSummary(user: User) {
  return apiFetch<WorkoutSummary>("/api/workouts/summary", { user });
}

/** 기록 탭 달력 — 연도별 운동 목록. */
export function fetchWorkoutsByYear(user: User, year: number) {
  return apiFetch<WorkoutListItem[]>(`/api/workouts?year=${year}`, { user });
}

export function fetchWorkout(id: number, user: User) {
  return apiFetch<WorkoutDetail>(`/api/workouts/${id}`, { user });
}

export function createWorkout(body: WorkoutCreateBody, user: User) {
  return apiFetch<CreatedId>("/api/workouts", { method: "POST", user, body });
}

/** 정적 export 환경에서 DELETE가 막히는 경우가 있어 POST .../delete 를 사용한다. */
export function deleteWorkout(id: number, user: User) {
  return apiFetch<void>(`/api/workouts/${id}/delete`, { method: "POST", user });
}
