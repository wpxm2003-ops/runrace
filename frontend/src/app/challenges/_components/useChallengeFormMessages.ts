"use client";

import { MAX_MEMBERS } from "@/lib/challengeForm";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import { goalMaxInUnit } from "@/lib/units";
import { useMemo } from "react";
import type { ChallengeFormHints, ChallengeFormLabels } from "./useChallengeForm";
import type { ChallengeFormValidationMessages } from "@/lib/challengeForm";
import type { ValidateChallengeFormOptions } from "@/lib/challengeForm";

export function useChallengeFormMessages(minMembers = 1) {
  const { t } = useLocale();
  const { unit } = useUnit();

  const labels: ChallengeFormLabels = useMemo(
    () => ({
      title: t.create_field_title,
      titlePlaceholder: t.create_field_title_placeholder,
      goal: `${t.create_field_goal} (${unit})`,
      goalPlaceholder: t.create_field_goal_placeholder,
      members: t.create_field_members,
      start: t.create_field_start,
      end: t.create_field_end,
      required: t.create_required,
    }),
    [t, unit],
  );

  const hints: ChallengeFormHints = useMemo(
    () => ({
      noSpecial: t.create_hint_no_special,
      titleMax: t.create_hint_title_max,
      goalMax: t.create_hint_goal_max,
      membersMax: t.create_hint_members_max,
    }),
    [t],
  );

  const validationMsgs: ChallengeFormValidationMessages = useMemo(
    () => ({
      titleRequired: t.create_err_title_required,
      titleSpecial: t.create_err_title_special,
      titleMax: t.create_err_title_max,
      goalRequired: t.create_err_goal_required,
      goalRange: t.create_err_goal_range(1, goalMaxInUnit(unit)),
      membersRequired: t.create_err_members_required,
      membersRange: t.create_err_members_range(minMembers, MAX_MEMBERS),
      startRequired: t.create_err_start_required,
      endRequired: t.create_err_end_required,
      startTooSoon: t.create_err_start_too_soon,
      endAfterStart: t.create_err_end_after_start,
      durationTooLong: t.create_err_duration_too_long,
    }),
    [t, minMembers, unit],
  );

  const validateOptions: ValidateChallengeFormOptions = useMemo(
    () => ({ minMembers }),
    [minMembers],
  );

  return { labels, hints, validationMsgs, validateOptions };
}
