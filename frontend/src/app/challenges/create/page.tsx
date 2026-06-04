"use client";

import { PageLayout } from "@/app/_components/PageLayout";
import { Alert } from "@/app/_components/ui/Alert";
import { Card } from "@/app/_components/ui/Card";
import { createChallenge, useActiveCount } from "@/lib/api";
import {
  addDays,
  clampMaxMembers,
  sanitizeDigits,
  todayStr,
  validateCreateChallengeForm,
} from "@/lib/challengeForm";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useLocale } from "@/lib/i18n";
import { useMemo, useState } from "react";

export default function CreateChallengePage() {
  const { user } = useRequireAuth("/challenges/create");
  const { t } = useLocale();
  const today = useMemo(() => todayStr(), []);

  const [title, setTitle] = useState("");
  const [goalKm, setGoalKm] = useState("");
  const [maxMembers, setMaxMembers] = useState("10");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(() => addDays(todayStr(), 1));
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: activeCount, error: countError } = useActiveCount(user);
  const endMin = startDate ? addDays(startDate, 1) : addDays(today, 1);
  const canCreate = activeCount != null && activeCount.activeCount < activeCount.maxActive;

  function onStartDateChange(v: string) {
    setStartDate(v);
    if (endDate && v && endDate <= v) setEndDate(addDays(v, 1));
  }

  async function onSubmit() {
    if (!user || !canCreate) return;
    setFormError(null);
    const validationError = validateCreateChallengeForm({ title, goalKm, maxMembers, startDate, endDate });
    if (validationError) { setFormError(validationError); return; }
    setSubmitting(true);
    try {
      await createChallenge(
        { title: title.trim(), goalKm: parseInt(goalKm, 10), maxMembers: parseInt(maxMembers, 10), startDate, endDate },
        user,
      );
      window.location.href = "/challenges";
    } catch (e) {
      setFormError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  const error = formError ?? (countError ? String(countError) : null);

  return (
    <PageLayout
      title={t.create_title}
      actions={
        <a className="text-sm text-zinc-600 hover:underline" href="/challenges">
          {t.create_list_link}
        </a>
      }
    >
      {activeCount && !canCreate ? (
        <Alert tone="warning" className="mb-4">
          {t.create_limit_warning(activeCount.maxActive, activeCount.activeCount)}
        </Alert>
      ) : null}
      {error ? <Alert className="mb-4">{error}</Alert> : null}

      <Card>
        <label className="block text-sm font-medium">
          {t.create_field_title} <span className="text-red-500">{t.create_required}</span>
        </label>
        <input
          className="mt-2 h-11 w-full rounded-xl border border-zinc-200 px-3"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t.create_field_title_placeholder}
          required
        />

        <label className="mt-4 block text-sm font-medium">
          {t.create_field_goal} <span className="text-red-500">{t.create_required}</span>
        </label>
        <input
          className="mt-2 h-11 w-full rounded-xl border border-zinc-200 px-3"
          inputMode="numeric"
          pattern="[0-9]*"
          value={goalKm}
          onChange={(e) => setGoalKm(sanitizeDigits(e.target.value))}
          placeholder={t.create_field_goal_placeholder}
          required
        />

        <label className="mt-4 block text-sm font-medium">
          {t.create_field_members} <span className="text-red-500">{t.create_required}</span>
        </label>
        <input
          className="mt-2 h-11 w-full rounded-xl border border-zinc-200 px-3"
          inputMode="numeric"
          pattern="[0-9]*"
          value={maxMembers}
          onChange={(e) => setMaxMembers(clampMaxMembers(e.target.value))}
          required
        />

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium">
              {t.create_field_start} <span className="text-red-500">{t.create_required}</span>
            </label>
            <input type="date" className="mt-2 h-11 w-full rounded-xl border border-zinc-200 px-3" value={startDate} min={today} onChange={(e) => onStartDateChange(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium">
              {t.create_field_end} <span className="text-red-500">{t.create_required}</span>
            </label>
            <input type="date" className="mt-2 h-11 w-full rounded-xl border border-zinc-200 px-3" value={endDate} min={endMin} onChange={(e) => setEndDate(e.target.value)} required />
          </div>
        </div>

        <button
          type="button"
          disabled={!canCreate || submitting}
          onClick={onSubmit}
          className="mt-6 h-11 w-full rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 disabled:bg-zinc-300"
        >
          {submitting ? t.create_btn_busy : t.create_btn}
        </button>
      </Card>
    </PageLayout>
  );
}
