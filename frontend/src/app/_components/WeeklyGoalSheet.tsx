"use client";

import { useState } from "react";
import type { User } from "firebase/auth";
import { toast } from "sonner";
import { saveWeeklyGoal } from "@/lib/api";
import type { WeeklyGoalStatus, WeeklyGoalType } from "@/lib/api/types";
import { track } from "@/lib/analytics";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import {
  clampGoalInput,
  defaultGoalType,
  formatWeeklyGoal,
  goalInputBounds,
  goalInputFromTarget,
  goalTargetFromInput,
  goalTargetToSave,
  suggestedTarget,
} from "@/lib/weeklyGoal";
import { BottomSheet } from "@/app/_components/ui/BottomSheet";
import { PrimaryButton } from "@/app/_components/ui/Button";
import { SheetHeader } from "@/app/_components/ui/SheetHeader";

/** 주간 목표 설정·수정 시트. 거리는 사용자 단위(km/mi) 정수, 횟수는 회 단위로 고른다. */
export function WeeklyGoalSheet({
  status,
  user,
  onClose,
  onSaved,
}: {
  status: WeeklyGoalStatus;
  user: User;
  onClose: () => void;
  onSaved: (next: WeeklyGoalStatus) => void;
}) {
  const { t } = useLocale();
  const { unit } = useUnit();
  const existing = status.goal;

  const initialValueFor = (type: WeeklyGoalType) =>
    existing && existing.type === type
      ? goalInputFromTarget(type, existing.target, unit, "nearest")
      : goalInputFromTarget(type, suggestedTarget(status, type), unit);

  const [type, setType] = useState<WeeklyGoalType>(existing?.type ?? defaultGoalType(status));
  const [draft, setDraft] = useState(() => String(initialValueFor(existing?.type ?? defaultGoalType(status))));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bounds = goalInputBounds(type, unit);
  const parsed = Number(draft);
  const value = clampGoalInput(type, draft === "" ? bounds.min : parsed, unit);
  const suggestionValue = goalInputFromTarget(type, suggestedTarget(status, type), unit);
  const suggestionText = formatWeeklyGoal(
    { type, target: goalTargetFromInput(type, suggestionValue, unit) },
    unit,
    t,
  );
  const unitLabel = type === "DISTANCE" ? unit : t.weekly_goal_runs_unit(value);

  function selectType(next: WeeklyGoalType) {
    if (next === type) return;
    setType(next);
    setDraft(String(initialValueFor(next)));
    setError(null);
  }

  function step(delta: number) {
    setDraft(String(clampGoalInput(type, value + delta, unit)));
    setError(null);
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    const target = goalTargetToSave(type, value, unit, existing);
    try {
      const next = await saveWeeklyGoal({ type, target }, user);
      void track("weekly_goal_set", {
        goal_type: type,
        target_value: value,
        target_unit: type === "DISTANCE" ? unit : "runs",
        is_edit: existing != null,
        is_suggestion: value === suggestionValue,
      });
      onSaved(next);
      toast.success(t.weekly_goal_saved);
      onClose();
    } catch {
      setError(t.weekly_goal_save_failed);
    } finally {
      setSaving(false);
    }
  }

  const typeOptions: { value: WeeklyGoalType; label: string }[] = [
    { value: "DISTANCE", label: t.weekly_goal_type_distance },
    { value: "RUNS", label: t.weekly_goal_type_runs },
  ];

  return (
    <BottomSheet onClose={onClose}>
      <SheetHeader title={t.weekly_goal_sheet_title} onClose={onClose} bordered closeLabel={t.close} />
      <div className="space-y-5 px-5 pb-6 pt-4">
        <div role="radiogroup" aria-label={t.weekly_goal_type_label} className="grid grid-cols-2 gap-1 rounded-control bg-panel-muted p-1">
          {typeOptions.map((option) => {
            const selected = option.value === type;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => selectType(option.value)}
                className={`min-h-10 rounded-control text-sm font-semibold transition-colors ${
                  selected ? "bg-panel text-ink shadow-card" : "text-muted hover:text-ink"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={value <= bounds.min}
            aria-label={t.weekly_goal_decrease}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-line text-2xl leading-none text-ink hover:bg-panel-muted disabled:opacity-35"
          >
            −
          </button>
          <label className="flex min-w-0 flex-1 items-baseline justify-center gap-1.5">
            <span className="sr-only">{t.weekly_goal_value_label}</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value.replace(/\D/g, "").slice(0, 3));
                setError(null);
              }}
              onBlur={() => setDraft(String(value))}
              className="rr-number w-24 bg-transparent text-center text-4xl font-black tracking-[-0.04em] text-ink outline-none"
            />
            <span className="text-sm font-bold text-muted">{unitLabel}</span>
          </label>
          <button
            type="button"
            onClick={() => step(1)}
            disabled={value >= bounds.max}
            aria-label={t.weekly_goal_increase}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-line text-2xl leading-none text-ink hover:bg-panel-muted disabled:opacity-35"
          >
            +
          </button>
        </div>

        <div className="space-y-1.5 text-center">
          <p className="text-xs text-muted">
            {status.suggestion.fromHistory
              ? t.weekly_goal_suggest_history(suggestionText)
              : t.weekly_goal_suggest_new(suggestionText)}
          </p>
          {value !== suggestionValue ? (
            <button
              type="button"
              onClick={() => {
                setDraft(String(suggestionValue));
                setError(null);
              }}
              className="min-h-8 rounded-control px-2 text-xs font-semibold text-brand hover:bg-brand-soft"
            >
              {t.weekly_goal_use_suggestion(suggestionText)}
            </button>
          ) : null}
          <p className="text-[11px] text-muted">{t.weekly_goal_sheet_hint}</p>
        </div>

        {error ? <p role="alert" className="text-center text-xs font-medium text-red-600">{error}</p> : null}

        <PrimaryButton onClick={save} disabled={saving} className="w-full">
          {saving ? t.saving : t.weekly_goal_save}
        </PrimaryButton>
      </div>
    </BottomSheet>
  );
}
