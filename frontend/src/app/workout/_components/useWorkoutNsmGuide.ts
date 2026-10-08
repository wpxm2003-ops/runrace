"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { useTrainingPlan } from "@/lib/api";
import {
  nsmTodayIndex,
  weeklyPlan,
  type NsmSession,
  type NsmVolumeBand,
} from "@/lib/nsm";

export function useWorkoutNsmGuide(user: User | null, active: boolean) {
  const { data: trainingPlan } = useTrainingPlan(user);
  const liveToday = trainingPlan
    ? weeklyPlan(
        trainingPlan.thresholdPaceSec,
        trainingPlan.subTDays,
        (trainingPlan.weeklyBand ?? undefined) as NsmVolumeBand | undefined,
      )[nsmTodayIndex()]
    : null;
  const [frozenToday, setFrozenToday] = useState<NsmSession | null>(null);

  useEffect(() => {
    if (active) setFrozenToday((previous) => previous ?? liveToday);
    else setFrozenToday(null);
    // A run keeps the session selected at its start, even across midnight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const today = active ? frozenToday ?? liveToday : liveToday;
  return {
    trainingPlan,
    today,
    isNsmDay: Boolean(today?.isSubT),
  };
}
