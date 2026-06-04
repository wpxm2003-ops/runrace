import type { User } from "firebase/auth";
import { apiFetch } from "./client";
import type { CreatedId, WorkoutCreateBody, WorkoutDetail, WorkoutListItem } from "./types";

export function fetchWorkouts(user: User, year?: number) {
  const q = year != null ? `?year=${year}` : "";
  return apiFetch<WorkoutListItem[]>(`/api/workouts/list${q}`, { user });
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
