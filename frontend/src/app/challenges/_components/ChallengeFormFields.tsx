"use client";

import { Alert } from "@/app/_components/ui/Alert";
import { Card } from "@/app/_components/ui/Card";
import { Button } from "@/app/_components/ui/Button";
import { STAKE_MAX_CHARS, minStartAtLocal, plusDaysLocal } from "@/lib/challengeForm";
import { useEffect, useState, type ReactNode } from "react";
import type { ChallengeFormLabels } from "./useChallengeForm";
import { DateTimePickerSheet } from "./DateTimePickerSheet";

type FormHandlers = {
  onTitleChange: (raw: string) => void;
  onGoalKmChange: (raw: string) => void;
  onMaxMembersChange: (raw: string) => void;
  onStartAtChange: (v: string) => void;
  onEndAtChange: (v: string) => void;
  onStakeChange: (raw: string) => void;
};

type Props = {
  labels: ChallengeFormLabels;
  values: {
    title: string;
    goalKm: string;
    maxMembers: string;
    startAt: string;
    endAt: string;
    stake: string;
  };
  handlers: FormHandlers;
  formError?: string | null;
  formHint?: string | null;
  formSuccess?: string | null;
  /** 내기 토글 아래, 저장 버튼 위에 끼우는 추가 섹션 (경품 등). */
  extraSection?: ReactNode;
  /** 저장 버튼 바로 위 안내 (등록 화면 등) */
  submitNotice?: string;
  submitLabel: string;
  submitBusyLabel: string;
  submitting: boolean;
  disabled?: boolean;
  onSubmit: () => void;
};

export function ChallengeFormFields({
  labels,
  values,
  handlers,
  formError,
  formHint,
  formSuccess,
  extraSection,
  submitNotice,
  submitLabel,
  submitBusyLabel,
  submitting,
  disabled = false,
  onSubmit,
}: Props) {
  const req = <span className="text-red-500">{labels.required}</span>;

  // 내기(페널티/보상) 입력 노출 토글. 기존 값이 있으면(수정 진입 등) 자동으로 펼친다.
  const [showStake, setShowStake] = useState(false);
  useEffect(() => {
    if (values.stake) setShowStake(true);
  }, [values.stake]);

  function toggleStake(checked: boolean) {
    setShowStake(checked);
    if (!checked) handlers.onStakeChange(""); // 접으면 값도 비운다
  }

  return (
    <>
      {formSuccess ? (
        <Alert tone="success" className="mb-4">
          {formSuccess}
        </Alert>
      ) : null}
      {formHint && !formSuccess ? (
        <Alert tone="info" className="mb-4">
          {formHint}
        </Alert>
      ) : null}
      {formError ? <Alert className="mb-4">{formError}</Alert> : null}

      <Card>
        <label className="block text-sm font-medium">
          {labels.title} {req}
        </label>
        <input
          className="mt-2 h-11 w-full rounded-xl border border-zinc-200 px-3"
          value={values.title}
          onChange={(e) => handlers.onTitleChange(e.target.value)}
          placeholder={labels.titlePlaceholder}
          required
        />

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium">
              {labels.goal} {req}
            </label>
            <input
              className="mt-2 h-11 w-full rounded-xl border border-zinc-200 px-3"
              inputMode="decimal"
              value={values.goalKm}
              onChange={(e) => handlers.onGoalKmChange(e.target.value)}
              placeholder={labels.goalPlaceholder}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium">
              {labels.members} {req}
            </label>
            <input
              className="mt-2 h-11 w-full rounded-xl border border-zinc-200 px-3"
              inputMode="numeric"
              pattern="[0-9]*"
              value={values.maxMembers}
              onChange={(e) => handlers.onMaxMembersChange(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium">
              {labels.start} {req}
            </label>
            <DateTimePickerSheet
              value={values.startAt}
              onChange={handlers.onStartAtChange}
              min={minStartAtLocal()}
              label={labels.start}
            />
          </div>
          <div>
            <label className="block text-sm font-medium">
              {labels.end} {req}
            </label>
            <DateTimePickerSheet
              value={values.endAt}
              onChange={handlers.onEndAtChange}
              min={values.startAt ? plusDaysLocal(values.startAt, 0) : minStartAtLocal()}
              label={labels.end}
            />
          </div>
        </div>

        <div className="mt-5 border-t border-zinc-100 pt-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-zinc-300"
              checked={showStake}
              onChange={(e) => toggleStake(e.target.checked)}
            />
            {labels.stakeToggle}
          </label>
        </div>
        {showStake ? (
          <input
            className="mt-2 h-11 w-full rounded-xl border border-zinc-200 px-3"
            value={values.stake}
            onChange={(e) => handlers.onStakeChange(e.target.value)}
            placeholder={labels.stakePlaceholder}
            maxLength={STAKE_MAX_CHARS}
          />
        ) : null}

        {extraSection}

        {submitNotice ? (
          <p className="mt-6 text-xs leading-relaxed text-black">{submitNotice}</p>
        ) : null}

        <Button
          variant="primary"
          disabled={disabled || submitting || !!formSuccess}
          onClick={onSubmit}
          className={`${submitNotice ? "mt-2" : "mt-6"} h-11 w-full`}
        >
          {submitting ? submitBusyLabel : submitLabel}
        </Button>
      </Card>
    </>
  );
}
