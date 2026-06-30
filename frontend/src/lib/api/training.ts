import type { User } from "firebase/auth";
import { apiFetch } from "./client";
import type { TrainingPlan } from "./types";

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
