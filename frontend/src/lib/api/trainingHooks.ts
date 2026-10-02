import type { User } from "firebase/auth";
import useSWR from "swr";
import {
  fetchNsmBlockReport,
  fetchNsmMyReport,
  fetchNsmWeeklyProgress,
  fetchTrainingPlan,
} from "./training";
import { BASE_CONFIG, COLD_CONFIG } from "./hookConfig";

/** 내 활성 NSM 훈련 플랜. */
export function useTrainingPlan(user: User | null) {
  return useSWR(
    user ? (["training-plan", user.uid] as const) : null,
    () => fetchTrainingPlan(user!),
    BASE_CONFIG,
  );
}

/** 이번 주 sub-T 진척 — NSM 코치 화면의 "이번 주 N/M 완료" 표시용. */
export function useNsmWeeklyProgress(user: User | null) {
  return useSWR(
    user ? (["nsm-weekly-progress", user.uid] as const) : null,
    () => fetchNsmWeeklyProgress(user!),
    BASE_CONFIG,
  );
}

/** 내 NSM 성장 리포트(역치 추이 + 누적). */
export function useNsmMyReport(user: User | null) {
  return useSWR(
    user ? (["nsm-my-report", user.uid] as const) : null,
    () => fetchNsmMyReport(user!),
    BASE_CONFIG,
  );
}

/** NSM 블록 공개 리포트 — 인증 불필요. */
export function useNsmBlockReport(id: number | null) {
  return useSWR(
    id != null ? (["nsm-block-report", id] as const) : null,
    () => fetchNsmBlockReport(id!),
    COLD_CONFIG,
  );
}
