"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useWorkoutSession } from "./useWorkoutSession";
import { purgeExpiredWorkout } from "./workoutPersistence";
import { useLocale } from "./i18n";
import { useAuth } from "./AuthProvider";

type WorkoutSessionValue = ReturnType<typeof useWorkoutSession>;

const WorkoutSessionContext = createContext<WorkoutSessionValue | null>(null);

/** 탭 전환 시에도 GPS 기록이 유지되도록 앱 루트에 둡니다. */
export function WorkoutSessionProvider({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  const { user, loading } = useAuth();

  // 만료 정리는 인증·소유자 일치와 무관하게 앱이 뜰 때 한 번 돈다 — 복원 경로 안에서만
  // 검사하면 로그아웃 상태나 다른 계정으로 열었을 때 정밀 GPS 경로가 계속 남는다.
  useEffect(() => {
    purgeExpiredWorkout();
  }, []);

  const session = useWorkoutSession(
    {
      title: t.workout_bg_notification_title,
      message: t.workout_bg_notification_msg,
    },
    {
      currentUid: user?.uid ?? null,
      loading,
      user: user ?? null,
    },
    {
      unavailable: t.geo_err_unavailable,
      insecure: t.geo_err_insecure,
      permission: t.geo_err_permission,
      timeout: t.geo_err_timeout,
      unknown: t.geo_err_unknown,
    },
  );
  return (
    <WorkoutSessionContext.Provider value={session}>
      {children}
    </WorkoutSessionContext.Provider>
  );
}

export function useWorkoutSessionContext(): WorkoutSessionValue {
  const ctx = useContext(WorkoutSessionContext);
  if (!ctx) {
    throw new Error("useWorkoutSessionContext must be used within WorkoutSessionProvider");
  }
  return ctx;
}
