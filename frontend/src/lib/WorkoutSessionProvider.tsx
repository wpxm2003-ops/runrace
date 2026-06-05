"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useWorkoutSession } from "./useWorkoutSession";
import { useLocale } from "./i18n";

type WorkoutSessionValue = ReturnType<typeof useWorkoutSession>;

const WorkoutSessionContext = createContext<WorkoutSessionValue | null>(null);

/** 탭 전환 시에도 GPS 기록이 유지되도록 앱 루트에 둡니다. */
export function WorkoutSessionProvider({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  const session = useWorkoutSession({
    title: t.workout_bg_notification_title,
    message: t.workout_bg_notification_msg,
  });
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
