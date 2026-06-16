"use client";

import { Alert } from "@/app/_components/ui/Alert";
import { Card } from "@/app/_components/ui/Card";
import { Button } from "@/app/_components/ui/Button";
import type { ChallengeFormLabels } from "./useChallengeForm";

type FormHandlers = {
  onTitleChange: (raw: string) => void;
  onGoalKmChange: (raw: string) => void;
  onMaxMembersChange: (raw: string) => void;
  onStartAtChange: (v: string) => void;
  onEndAtChange: (v: string) => void;
};

type Props = {
  labels: ChallengeFormLabels;
  values: {
    title: string;
    goalKm: string;
    maxMembers: string;
    startAt: string;
    endAt: string;
  };
  startAtMin: string;
  startAtMax?: string;
  endMin: string;
  endMax?: string;
  handlers: FormHandlers;
  formError?: string | null;
  formHint?: string | null;
  formSuccess?: string | null;
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
  startAtMin,
  startAtMax,
  endMin,
  endMax,
  handlers,
  formError,
  formHint,
  formSuccess,
  submitNotice,
  submitLabel,
  submitBusyLabel,
  submitting,
  disabled = false,
  onSubmit,
}: Props) {
  const req = <span className="text-red-500">{labels.required}</span>;

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

        <label className="mt-4 block text-sm font-medium">
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

        <label className="mt-4 block text-sm font-medium">
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

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium">
              {labels.start} {req}
            </label>
            <input
              type="datetime-local"
              className="mt-2 h-11 w-full rounded-xl border border-zinc-200 px-3"
              value={values.startAt}
              min={startAtMin}
              max={startAtMax}
              step={60}
              onChange={(e) => handlers.onStartAtChange(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium">
              {labels.end} {req}
            </label>
            <input
              type="datetime-local"
              className="mt-2 h-11 w-full rounded-xl border border-zinc-200 px-3"
              value={values.endAt}
              min={endMin}
              max={endMax}
              step={60}
              onChange={(e) => handlers.onEndAtChange(e.target.value)}
              required
            />
          </div>
        </div>

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
