import type { User } from "firebase/auth";
import { apiFetch } from "./client";
import type { NsmSessionLogBody, NsmWeeklyProgress, TrainingPlan } from "./types";

/** 내 활성 NSM 플랜. 없으면 null. */
export function fetchTrainingPlan(user: User) {
  return apiFetch<TrainingPlan | null>("/api/training-plan", { user });
}

/** NSM 플랜 저장(upsert). */
export function saveTrainingPlan(body: TrainingPlan, user: User) {
  return apiFetch<TrainingPlan>("/api/training-plan", { method: "PUT", user, body });
}

/** NSM 플랜 취소(삭제). 정적 export 환경 대응으로 POST 사용. */
export function cancelTrainingPlan(user: User) {
  return apiFetch<void>("/api/training-plan/cancel", { method: "POST", user });
}

/** sub-T 세션 수행 기록 — 런 저장 성공 직후 1회. 같은 운동 기록이면 서버가 멱등 처리한다. */
export function logNsmSession(body: NsmSessionLogBody, user: User) {
  return apiFetch<void>("/api/training-plan/sessions", { method: "POST", user, body });
}

/** 이번 주 sub-T 진척. */
export function fetchNsmWeeklyProgress(user: User) {
  return apiFetch<NsmWeeklyProgress>("/api/training-plan/sessions/weekly", { user });
}
