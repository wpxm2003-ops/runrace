import type { User } from "firebase/auth";
import { apiFetch, publicFetch } from "./client";
import type { NsmBlockReport, NsmMyReport, NsmSessionLogBody, NsmWeeklyProgress, TrainingPlan } from "./types";

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

/** 내 성장 리포트(역치 추이 + 누적) — 인증 필요. */
export function fetchNsmMyReport(user: User) {
  return apiFetch<NsmMyReport>("/api/training-plan/report", { user });
}

/** NSM 블록 공개 리포트 — 인증 불필요(공유 링크로 누구나 조회). */
export function fetchNsmBlockReport(id: number) {
  return publicFetch<NsmBlockReport>(`/api/training-plan/report/${id}`);
}
