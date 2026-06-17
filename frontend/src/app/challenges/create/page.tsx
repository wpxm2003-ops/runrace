"use client";

import Link from "next/link";
import { PageLayout } from "@/app/_components/PageLayout";
import { Alert } from "@/app/_components/ui/Alert";
import { ChallengeFormFields } from "@/app/challenges/_components/ChallengeFormFields";
import {
  defaultCreateFormInitial,
  useChallengeForm,
} from "@/app/challenges/_components/useChallengeForm";
import { useChallengeFormMessages } from "@/app/challenges/_components/useChallengeFormMessages";
import { createChallenge, invalidateChallengeLists, useActiveCount } from "@/lib/api";
import { minStartAtLocal, plusDaysLocal } from "@/lib/challengeForm";
import { RACE_TEMPLATES, type RaceTemplate, type RaceTemplateKey } from "@/lib/raceTemplates";
import { goalInputFromKm } from "@/lib/units";
import { track } from "@/lib/analytics";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import { nativeNavigate } from "@/lib/nativeNav";
import { useState } from "react";

export default function CreateChallengePage() {
  const { user } = useRequireAuth("/challenges/create");
  const { t, locale } = useLocale();
  const { unit } = useUnit();
  const [submitting, setSubmitting] = useState(false);

  const { labels, hints, validationMsgs, validateOptions } = useChallengeFormMessages(1);
  const form = useChallengeForm({
    initial: defaultCreateFormInitial(),
    validationMsgs,
    validateOptions,
    hints,
  });

  const templateNames: Record<RaceTemplateKey, string> = {
    weekend10: t.tpl_weekend10,
    week30: t.tpl_week30,
    commute: t.tpl_commute,
    diet2w: t.tpl_diet2w,
  };

  // 템플릿 탭 → 목표·기간을 폼에 채운다. 시작=내일(참가 창 확보), 종료=시작+기간. 사용자가 이후 조정 가능.
  function applyTemplate(tpl: RaceTemplate) {
    const startAt = plusDaysLocal(minStartAtLocal(), 1);
    form.reset({
      title: templateNames[tpl.key],
      goalKm: goalInputFromKm(tpl.goalKm, unit),
      maxMembers: "10",
      startAt,
      endAt: plusDaysLocal(startAt, tpl.durationDays),
      stake: "",
    });
  }

  const { data: activeCount, error: countError } = useActiveCount(user);
  const canCreate = activeCount != null && activeCount.activeCount < activeCount.maxActive;

  async function onSubmit() {
    if (!user || !canCreate) return;
    form.clearFeedback();
    const validationError = form.validate();
    if (validationError) {
      form.setFormError(validationError);
      return;
    }
    setSubmitting(true);
    try {
      await createChallenge({ ...form.getPayload(), langCd: locale }, user);
      invalidateChallengeLists();
      void track("race_created");
      form.setFormSuccess(t.create_success);
      window.setTimeout(() => nativeNavigate("/challenges"), 1200);
    } catch (e) {
      form.setFormError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  const error = form.formError ?? (countError ? String(countError) : null);

  return (
    <PageLayout
      title={t.create_title}
      actions={
        <Link className="text-sm text-zinc-600 hover:underline" href="/challenges">
          {t.create_list_link}
        </Link>
      }
    >
      {activeCount && !canCreate ? (
        <Alert tone="warning" className="mb-4">
          {t.create_limit_warning(activeCount.maxActive, activeCount.activeCount)}
        </Alert>
      ) : null}

      {/* 빠른 시작 — 탭하면 목표·기간이 자동으로 채워진다 */}
      <div className="mb-4">
        <p className="mb-2 text-sm font-medium text-zinc-700">{t.tpl_section_title}</p>
        <div className="flex flex-wrap gap-2">
          {RACE_TEMPLATES.map((tpl) => (
            <button
              key={tpl.key}
              type="button"
              onClick={() => applyTemplate(tpl)}
              className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50"
            >
              {tpl.emoji} {templateNames[tpl.key]}
            </button>
          ))}
        </div>
      </div>

      <ChallengeFormFields
        labels={labels}
        values={form.values}
        handlers={{
          onTitleChange: form.onTitleChange,
          onGoalKmChange: form.onGoalKmChange,
          onMaxMembersChange: form.onMaxMembersChange,
          onStartAtChange: form.onStartAtChange,
          onEndAtChange: form.onEndAtChange,
          onStakeChange: form.onStakeChange,
        }}
        formError={error}
        formHint={form.formHint}
        formSuccess={form.formSuccess}
        submitNotice={t.create_solo_notice}
        submitLabel={t.create_btn}
        submitBusyLabel={t.create_btn_busy}
        submitting={submitting}
        disabled={!canCreate}
        onSubmit={onSubmit}
      />
    </PageLayout>
  );
}
