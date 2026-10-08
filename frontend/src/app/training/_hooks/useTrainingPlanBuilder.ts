"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { toast } from "sonner";
import { useConfirm } from "@/app/_components/ConfirmProvider";
import {
  cancelTrainingPlan,
  saveTrainingPlan,
  useNsmWeeklyProgress,
  usePersonalBests,
  useTrainingPlan,
} from "@/lib/api";
import type { PersonalBestRow } from "@/lib/api/types";
import { track } from "@/lib/analytics";
import { redirectToLogin } from "@/lib/auth";
import type { Translations } from "@/lib/i18n/translations";
import {
  clampSubTDaysToBand,
  isRealisticThreshold,
  nsmTodayIndex,
  subTDayLimits,
  thresholdPaceSecPerKm,
  vdotFromRace,
  weeklyPlan,
  type NsmSession,
  type NsmVolumeBand,
} from "@/lib/nsm";
import { clearNsmProgress } from "@/lib/nsmSessionProgress";
import { pbFinishSec } from "@/lib/paceMath";
import { sessionJson } from "@/lib/safeStorage";
import { formatTime, parseTime } from "@/app/training/trainingUtils";

type NsmDraft = {
  distM: number;
  timeStr: string;
  subTDays: number[];
  band?: NsmVolumeBand;
};

export type TrainingPlanResult = {
  vdot: number;
  threshold: number;
  plan: NsmSession[];
  sourceDistanceM: number;
  sourceTimeSec: number;
};

const nsmDraftStore = sessionJson<NsmDraft>("nsm_calc_draft");

function sortedKey(values: number[]): string {
  return [...values].sort((left, right) => left - right).join(",");
}

export function useTrainingPlanBuilder(user: User | null, t: Translations) {
  const confirm = useConfirm();
  const { data: pbs } = usePersonalBests(user);
  const { data: savedPlan, mutate: mutatePlan } = useTrainingPlan(user);
  const { data: weekly } = useNsmWeeklyProgress(user);

  const [distM, setDistM] = useState(5000);
  const [timeStr, setTimeStr] = useState("22:00");
  const [subTDays, setSubTDays] = useState<number[]>([1, 3]);
  const [band, setBand] = useState<NsmVolumeBand | undefined>(2);
  const [result, setResult] = useState<TrainingPlanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const hydratedRef = useRef(false);

  function compute(
    distanceM: number,
    seconds: number,
    days: number[],
    volumeBand: NsmVolumeBand | undefined = band,
  ): boolean {
    const vdot = vdotFromRace(distanceM, seconds);
    const threshold = thresholdPaceSecPerKm(vdot);
    if (!isRealisticThreshold(threshold)) {
      setError(t.nsm_range_error);
      setResult(null);
      return false;
    }
    setError(null);
    setResult({
      vdot,
      threshold,
      plan: weeklyPlan(threshold, days, volumeBand),
      sourceDistanceM: distanceM,
      sourceTimeSec: seconds,
    });
    return true;
  }

  useEffect(() => {
    if (hydratedRef.current) return;
    // 로그인 전 입력을 이어가는 초안은 서버 캐시 유무와 무관하게 우선한다.
    const draft = nsmDraftStore.get();
    if (draft && !result) {
      hydratedRef.current = true;
      nsmDraftStore.remove();
      setSubTDays(draft.subTDays);
      setDistM(draft.distM);
      setTimeStr(draft.timeStr);
      setBand(draft.band);
      const seconds = parseTime(draft.timeStr);
      if (seconds != null && seconds > 0) {
        compute(draft.distM, seconds, draft.subTDays, draft.band);
      }
      return;
    }
    if (!savedPlan) return;

    hydratedRef.current = true;
    if (result) return;
    const savedVdot = Number(savedPlan.vdot);
    if (!Number.isFinite(savedVdot) || !Number.isFinite(savedPlan.thresholdPaceSec)) return;
    const savedBand = (savedPlan.weeklyBand ?? undefined) as NsmVolumeBand | undefined;
    setSubTDays(savedPlan.subTDays);
    setDistM(savedPlan.sourceDistanceM);
    setTimeStr(formatTime(savedPlan.sourceTimeSec));
    setBand(savedBand);
    setResult({
      vdot: savedVdot,
      threshold: savedPlan.thresholdPaceSec,
      plan: weeklyPlan(savedPlan.thresholdPaceSec, savedPlan.subTDays, savedBand),
      sourceDistanceM: savedPlan.sourceDistanceM,
      sourceTimeSec: savedPlan.sourceTimeSec,
    });
    // The server plan or one-time draft must hydrate the editor only once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedPlan]);

  function calculate() {
    hydratedRef.current = true;
    const seconds = parseTime(timeStr);
    if (seconds == null || seconds <= 0) {
      setError(t.nsm_time_error);
      setResult(null);
      return;
    }
    compute(distM, seconds, subTDays);
  }

  function pickPersonalBest(pb: PersonalBestRow) {
    hydratedRef.current = true;
    const seconds = pbFinishSec(pb.bestPaceSec, pb.distanceM);
    setDistM(pb.distanceM);
    setTimeStr(formatTime(seconds));
    setError(null);
    compute(pb.distanceM, seconds, subTDays);
  }

  function toggleDay(day: number) {
    const { min, max } = subTDayLimits(band);
    let next: number[];
    if (subTDays.includes(day)) {
      if (subTDays.length <= min) {
        toast(t.nsm_min_days_notice(min));
        return;
      }
      next = subTDays.filter((candidate) => candidate !== day);
    } else if (subTDays.length >= max) {
      next = [...subTDays.slice(1), day];
    } else {
      next = [...subTDays, day];
    }
    hydratedRef.current = true;
    setSubTDays(next);
    if (result) setResult({ ...result, plan: weeklyPlan(result.threshold, next, band) });
  }

  function selectBand(nextBand: NsmVolumeBand) {
    hydratedRef.current = true;
    const nextDays = clampSubTDaysToBand(subTDays, nextBand);
    setBand(nextBand);
    setSubTDays(nextDays);
    if (result) {
      setResult({ ...result, plan: weeklyPlan(result.threshold, nextDays, nextBand) });
    }
  }

  async function save() {
    if (!result || saving || !user) return;
    setSaving(true);
    try {
      const normalizedDays = Array.from(new Set(subTDays)).sort((a, b) => a - b).slice(0, 3);
      await saveTrainingPlan({
        vdot: result.vdot,
        thresholdPaceSec: result.threshold,
        subTDays: normalizedDays,
        sourceDistanceM: result.sourceDistanceM,
        sourceTimeSec: result.sourceTimeSec,
        weeklyBand: band,
      }, user);
      await mutatePlan();
      void track("nsm_plan_saved", { weekly_band: band ?? "unknown" });
      toast.success(t.nsm_toast_saved);
    } catch {
      toast.error(t.nsm_toast_save_fail);
    } finally {
      setSaving(false);
    }
  }

  async function cancel() {
    if (!user || canceling) return;
    const confirmed = await confirm({
      title: t.nsm_cancel_title,
      message: t.nsm_cancel_message,
      confirmLabel: t.nsm_cancel_confirm,
      cancelLabel: t.nsm_cancel_keep,
      destructive: true,
    });
    if (!confirmed) return;
    setCanceling(true);
    try {
      await cancelTrainingPlan(user);
      await mutatePlan(null, { revalidate: false });
      setResult(null);
      hydratedRef.current = false;
      clearNsmProgress();
      toast.success(t.nsm_toast_canceled);
    } catch {
      toast.error(t.nsm_toast_cancel_fail);
    } finally {
      setCanceling(false);
    }
  }

  function continueToLogin() {
    nsmDraftStore.set({ distM, timeStr, subTDays, band });
    redirectToLogin("/training");
  }

  const isSaved = savedPlan != null
    && result != null
    && savedPlan.thresholdPaceSec === result.threshold
    && savedPlan.sourceDistanceM === result.sourceDistanceM
    && savedPlan.sourceTimeSec === result.sourceTimeSec
    && (savedPlan.weeklyBand ?? undefined) === band
    && sortedKey(savedPlan.subTDays) === sortedKey(subTDays);

  const todaySession = savedPlan
    ? weeklyPlan(
        savedPlan.thresholdPaceSec,
        savedPlan.subTDays,
        (savedPlan.weeklyBand ?? undefined) as NsmVolumeBand | undefined,
      )[nsmTodayIndex()]
    : null;

  return {
    pbs,
    savedPlan,
    weekly,
    distM,
    setDistM: (next: number) => {
      hydratedRef.current = true;
      setDistM(next);
    },
    timeStr,
    setTimeStr: (next: string) => {
      hydratedRef.current = true;
      setTimeStr(next);
    },
    subTDays,
    band,
    result,
    error,
    saving,
    canceling,
    isSaved,
    todaySession,
    calculate,
    pickPersonalBest,
    toggleDay,
    selectBand,
    save,
    cancel,
    continueToLogin,
  };
}
