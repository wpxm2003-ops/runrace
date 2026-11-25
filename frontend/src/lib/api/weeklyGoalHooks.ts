import type { User } from "firebase/auth";
import useSWR from "swr";
import { BASE_CONFIG } from "./hookConfig";
import { fetchWeeklyGoal } from "./weeklyGoal";

/** 홈 주간 목표 카드. 홈에 돌아올 때마다(마운트) 다시 받아 방금 저장한 러닝이 반영된다. */
export function useWeeklyGoal(user: User | null) {
  return useSWR(
    user ? (["weekly-goal", user.uid] as const) : null,
    () => fetchWeeklyGoal(user!),
    BASE_CONFIG,
  );
}
