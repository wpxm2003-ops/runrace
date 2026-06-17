"use client";

import {
  MAX_MEMBERS,
  clampGoalKm,
  clampMaxMembers,
  defaultEndAtAfterStart,
  minStartAtLocal,
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
  const [formError, setFormError] = useState<string | null>(null);
  const [formHint, setFormHint] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const values: ChallengeFormValues = useMemo(
    () => ({ title, goalKm, maxMembers, startAt, endAt }),
    [title, goalKm, maxMembers, startAt, endAt],
  );

  const clearFeedback = useCallback(() => {
    setFormError(null);
    setFormHint(null);
    setFormSuccess(null);
  }, []);

  const reset = useCallback((next: Partial<ChallengeFormValues>) => {
    setTitle(next.title ?? "");
    setGoalKm(next.goalKm ?? "");
    setMaxMembers(next.maxMembers ?? "");
    setStartAt(next.startAt ?? "");
    setEndAt(next.endAt ?? "");
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
      const { value, clamped } = clampGoalKm(raw, unit);
      setGoalKm(value);
      if (clamped) setFormHint(hints.goalMax(goalMaxInUnit(unit)));
      else setFormHint(null);
      setFormError(null);
      setFormSuccess(null);
    },
    [hints, unit],
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
    [hints],
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
    setFormError(null);
    setFormSuccess(null);
  }, []);

  const onEndAtChange = useCallback((v: string) => {
    setEndAt(v);
    setFormError(null);
    setFormSuccess(null);
  }, []);

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
    formSuccess,
    setFormSuccess,
    clearFeedback,
    reset,
    onTitleChange,
    onGoalKmChange,
    onMaxMembersChange,
    onStartAtChange,
    onEndAtChange,
    validate,
    getPayload,
  };
}

export function defaultCreateFormInitial(): ChallengeFormValues {
  const startAt = minStartAtLocal();
  return {
    title: "",
    goalKm: "",
    maxMembers: "10",
    startAt,
    endAt: defaultEndAtAfterStart(startAt),
  };
}
