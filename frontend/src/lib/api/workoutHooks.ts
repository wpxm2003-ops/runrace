import type { User } from "firebase/auth";
import useSWR from "swr";
import { appMutate } from "@/lib/swrMutate";
import { BASE_CONFIG, COLD_CONFIG } from "./hookConfig";
import type { WorkoutDetail } from "./types";
import {
  fetchPersonalBests,
  fetchWorkout,
  fetchWorkoutComparison,
  fetchWorkoutShare,
  fetchWorkoutSummary,
  fetchWorkoutsByYear,
} from "./workouts";

/** 내 PB 목록 — NSM 페이스 자동 입력 등. */
export function usePersonalBests(user: User | null) {
  return useSWR(
    user ? (["personal-bests", user.uid] as const) : null,
    () => fetchPersonalBests(user!),
    BASE_CONFIG,
  );
}

/** 내정보 — 전체 요약. */
export function useWorkoutSummary(user: User | null) {
  return useSWR(
    user ? (["workouts", "summary", user.uid] as const) : null,
    () => fetchWorkoutSummary(user!),
    BASE_CONFIG,
  );
}

/** 기록 달력 — 해당 연도 목록. */
export function useWorkoutListByYear(user: User | null, year: number) {
  return useSWR(
    user ? (["workouts", user.uid, year] as const) : null,
    () => fetchWorkoutsByYear(user!, year),
    BASE_CONFIG,
  );
}

export function invalidateWorkoutLists(userId: string, year?: number) {
  void appMutate(["workouts", "summary", userId]);
  if (year != null) void appMutate(["workouts", userId, year]);
}

export function useWorkoutDetail(workoutId: number | null, user: User | null) {
  return useSWR(
    user && workoutId != null ? (["workout", workoutId, user.uid] as const) : null,
    () => fetchWorkout(workoutId!, user!),
    BASE_CONFIG,
  );
}

export function invalidateWorkoutDetail(workoutId: number, userId: string) {
  void appMutate(["workout", workoutId, userId]);
}

export function patchWorkoutDetailImage(
  workoutId: number,
  userId: string,
  imageUrl: string | null,
) {
  void appMutate(
    ["workout", workoutId, userId],
    (cur?: WorkoutDetail) => (cur ? { ...cur, imageUrl } : cur),
    { revalidate: false },
  );
}

export function useWorkoutComparison(workoutId: number | null, user: User | null) {
  return useSWR(
    user && workoutId != null ? (["workout-comparison", workoutId, user.uid] as const) : null,
    () => fetchWorkoutComparison(workoutId!, user!),
    COLD_CONFIG,
  );
}

/** 공개 공유 페이지용 운동 데이터. */
export function useWorkoutShare(id: number | null) {
  return useSWR(
    id != null ? (["workout-share", id] as const) : null,
    () => fetchWorkoutShare(id!),
    COLD_CONFIG,
  );
}
