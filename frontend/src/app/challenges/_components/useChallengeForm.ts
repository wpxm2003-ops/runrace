"use client";

import {
  MAX_MEMBERS,
  clampGoalKm,
  clampMaxMembers,
  defaultEndAtAfterStart,
  minStartAtLocal,
  plusDaysLocal,
  sanitizeStake,
  sanitizeTitle,
  toChallengeFormPayload,
  validateChallengeForm,
  type ChallengeFormPayload,
  type ChallengeFormValidationMessages,
  type ChallengeFormValues,
  type ValidateChallengeFormOptions,
} from "@/lib/challengeForm";
import { goalMaxInUnit } from "@/lib/units";
import { useUnit } from "@/lib/UnitContext";
import { useCallback, useMemo, useState } from "react";

export type ChallengeFormHints = {
  noSpecial: string;
  titleMax: string;
  stakeMax: string;
  goalMax: (max: number) => string;
  membersMax: (max: number) => string;
};

export type ChallengeFormLabels = {
  title: string;
  titlePlaceholder?: string;
  goal: string;
  goalPlaceholder?: string;
  members: string;
  start: string;
  end: string;
  required: string;
  stakeToggle: string;
  stakePlaceholder: string;
};

type Options = {
  initial?: Partial<ChallengeFormValues>;
  validationMsgs: ChallengeFormValidationMessages;
  validateOptions?: ValidateChallengeFormOptions;
  hints: ChallengeFormHints;
};

export function useChallengeForm({
  initial,
  validationMsgs,
  validateOptions,
  hints,
}: Options) {
  const { unit } = useUnit();

  const [title, setTitle] = useState(initial?.title ?? "");
  const [goalKm, setGoalKm] = useState(initial?.goalKm ?? "");
  const [maxMembers, setMaxMembers] = useState(initial?.maxMembers ?? "");
  const [startAt, setStartAt] = useState(initial?.startAt ?? "");
  const [endAt, setEndAt] = useState(initial?.endAt ?? "");
  const [stake, setStake] = useState(initial?.stake ?? "");
  const [formError, setFormError] = useState<string | null>(null);
  const [formHint, setFormHint] = useState<string | null>(null);

  const values: ChallengeFormValues = useMemo(
    () => ({ title, goalKm, maxMembers, startAt, endAt, stake }),
    [title, goalKm, maxMembers, startAt, endAt, stake],
  );

  const clearFeedback = useCallback(() => {
    setFormError(null);
    setFormHint(null);
  }, []);

  /** 입력 시 직전 에러만 지운다(힌트는 각 핸들러가 따로 설정). */
  const clearErrors = useCallback(() => {
    setFormError(null);
  }, []);

  const reset = useCallback((next: Partial<ChallengeFormValues>) => {
    setTitle(next.title ?? "");
    setGoalKm(next.goalKm ?? "");
    setMaxMembers(next.maxMembers ?? "");
    setStartAt(next.startAt ?? "");
    setEndAt(next.endAt ?? "");
    setStake(next.stake ?? "");
    clearFeedback();
  }, [clearFeedback]);

  const onTitleChange = useCallback(
    (raw: string) => {
      const { value, removedSpecial, truncated } = sanitizeTitle(raw);
      setTitle(value);
      if (removedSpecial) setFormHint(hints.noSpecial);
      else if (truncated) setFormHint(hints.titleMax);
      else setFormHint(null);
      clearErrors();
    },
    [hints.noSpecial, hints.titleMax, clearErrors],
  );

  const onGoalKmChange = useCallback(
    (raw: string) => {
      const { value, clamped } = clampGoalKm(raw, unit);
      setGoalKm(value);
      if (clamped) setFormHint(hints.goalMax(goalMaxInUnit(unit)));
      else setFormHint(null);
      clearErrors();
    },
    [hints, unit, clearErrors],
  );

  const onMaxMembersChange = useCallback(
    (raw: string) => {
      const { value, clamped } = clampMaxMembers(raw);
      setMaxMembers(value);
      if (clamped) setFormHint(hints.membersMax(MAX_MEMBERS));
      else setFormHint(null);
      clearErrors();
    },
    [hints, clearErrors],
  );

  const onStartAtChange = useCallback((v: string) => {
    setStartAt(v);
    setEndAt((prev) => {
      if (!v) return prev;
      if (!prev || new Date(prev).getTime() <= new Date(v).getTime()) {
        return defaultEndAtAfterStart(v);
      }
      return prev;
    });
    clearErrors();
  }, [clearErrors]);

  const onEndAtChange = useCallback((v: string) => {
    setEndAt(v);
    clearErrors();
  }, [clearErrors]);

  const onStakeChange = useCallback(
    (raw: string) => {
      const { value, removedSpecial, truncated } = sanitizeStake(raw);
      setStake(value);
      if (removedSpecial) setFormHint(hints.noSpecial);
      else if (truncated) setFormHint(hints.stakeMax);
      else setFormHint(null);
      clearErrors();
    },
    [hints.noSpecial, hints.stakeMax, clearErrors],
  );

  const validate = useCallback((): string | null => {
    return validateChallengeForm(values, validationMsgs, { ...validateOptions, unit });
  }, [values, validationMsgs, validateOptions, unit]);

  const getPayload = useCallback((): ChallengeFormPayload => {
    return toChallengeFormPayload(values, unit);
  }, [values, unit]);

  return {
    values,
    formError,
    setFormError,
    formHint,
    clearFeedback,
    reset,
    onTitleChange,
    onGoalKmChange,
    onMaxMembersChange,
    onStartAtChange,
    onEndAtChange,
    onStakeChange,
    validate,
    getPayload,
  };
}

export function defaultCreateFormInitial(): ChallengeFormValues {
  // 참가 창 확보 — 시작을 내일로 둬서 '혼자 즉시 시작' 트랩을 막는다.
  const startAt = plusDaysLocal(minStartAtLocal(), 1);
  return {
    title: "",
    goalKm: "",
    maxMembers: "10",
    startAt,
    endAt: defaultEndAtAfterStart(startAt),
    stake: "",
  };
}
