"use client";

import {
  MAX_GOAL_KM,
  MAX_MEMBERS,
  addDays,
  clampGoalKm,
  clampMaxMembers,
  sanitizeTitle,
  todayStr,
  toChallengeFormPayload,
  validateChallengeForm,
  type ChallengeFormPayload,
  type ChallengeFormValidationMessages,
  type ChallengeFormValues,
  type ValidateChallengeFormOptions,
} from "@/lib/challengeForm";
import { useCallback, useMemo, useState } from "react";

export type ChallengeFormHints = {
  noSpecial: string;
  titleMax: string;
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
};

type Options = {
  initial?: Partial<ChallengeFormValues>;
  validationMsgs: ChallengeFormValidationMessages;
  validateOptions?: ValidateChallengeFormOptions;
  hints: ChallengeFormHints;
};

const EMPTY: ChallengeFormValues = {
  title: "",
  goalKm: "",
  maxMembers: "",
  startDate: "",
  endDate: "",
};

export function useChallengeForm({
  initial,
  validationMsgs,
  validateOptions,
  hints,
}: Options) {
  const today = useMemo(() => todayStr(), []);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [goalKm, setGoalKm] = useState(initial?.goalKm ?? "");
  const [maxMembers, setMaxMembers] = useState(initial?.maxMembers ?? "");
  const [startDate, setStartDate] = useState(initial?.startDate ?? "");
  const [endDate, setEndDate] = useState(initial?.endDate ?? "");
  const [formError, setFormError] = useState<string | null>(null);
  const [formHint, setFormHint] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const values: ChallengeFormValues = { title, goalKm, maxMembers, startDate, endDate };
  const endMin = startDate ? addDays(startDate, 1) : addDays(today, 1);

  const clearFeedback = useCallback(() => {
    setFormError(null);
    setFormHint(null);
    setFormSuccess(null);
  }, []);

  const reset = useCallback((next: Partial<ChallengeFormValues>) => {
    setTitle(next.title ?? "");
    setGoalKm(next.goalKm ?? "");
    setMaxMembers(next.maxMembers ?? "");
    setStartDate(next.startDate ?? "");
    setEndDate(next.endDate ?? "");
    clearFeedback();
  }, [clearFeedback]);

  const onTitleChange = useCallback(
    (raw: string) => {
      const { value, removedSpecial, truncated } = sanitizeTitle(raw);
      setTitle(value);
      if (removedSpecial) setFormHint(hints.noSpecial);
      else if (truncated) setFormHint(hints.titleMax);
      else setFormHint(null);
      setFormError(null);
      setFormSuccess(null);
    },
    [hints.noSpecial, hints.titleMax],
  );

  const onGoalKmChange = useCallback(
    (raw: string) => {
      const { value, clamped } = clampGoalKm(raw);
      setGoalKm(value);
      if (clamped) setFormHint(hints.goalMax(MAX_GOAL_KM));
      else setFormHint(null);
      setFormError(null);
      setFormSuccess(null);
    },
    [hints.goalMax],
  );

  const onMaxMembersChange = useCallback(
    (raw: string) => {
      const { value, clamped } = clampMaxMembers(raw);
      setMaxMembers(value);
      if (clamped) setFormHint(hints.membersMax(MAX_MEMBERS));
      else setFormHint(null);
      setFormError(null);
      setFormSuccess(null);
    },
    [hints.membersMax],
  );

  const onStartDateChange = useCallback(
    (v: string) => {
      setStartDate(v);
      setEndDate((prev) => (prev && v && prev <= v ? addDays(v, 1) : prev));
      setFormError(null);
      setFormSuccess(null);
    },
    [],
  );

  const onEndDateChange = useCallback((v: string) => {
    setEndDate(v);
    setFormError(null);
    setFormSuccess(null);
  }, []);

  const validate = useCallback((): string | null => {
    return validateChallengeForm(values, validationMsgs, validateOptions);
  }, [values, validationMsgs, validateOptions]);

  const getPayload = useCallback((): ChallengeFormPayload => {
    return toChallengeFormPayload(values);
  }, [values]);

  return {
    today,
    endMin,
    values,
    formError,
    setFormError,
    formHint,
    formSuccess,
    setFormSuccess,
    clearFeedback,
    reset,
    onTitleChange,
    onGoalKmChange,
    onMaxMembersChange,
    onStartDateChange,
    onEndDateChange,
    validate,
    getPayload,
  };
}

export function defaultCreateFormInitial(): ChallengeFormValues {
  const today = todayStr();
  return {
    title: "",
    goalKm: "",
    maxMembers: "10",
    startDate: today,
    endDate: addDays(today, 1),
  };
}
