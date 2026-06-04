"use client";

import { PageLayout } from "@/app/_components/PageLayout";
import { Alert } from "@/app/_components/ui/Alert";
import { ChallengeFormFields } from "@/app/challenges/_components/ChallengeFormFields";
import {
  defaultCreateFormInitial,
  useChallengeForm,
} from "@/app/challenges/_components/useChallengeForm";
import { useChallengeFormMessages } from "@/app/challenges/_components/useChallengeFormMessages";
import { createChallenge, useActiveCount } from "@/lib/api";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useLocale } from "@/lib/i18n";
import { nativeNavigate } from "@/lib/nativeNav";
import { useState } from "react";

export default function CreateChallengePage() {
  const { user } = useRequireAuth("/challenges/create");
  const { t } = useLocale();
  const [submitting, setSubmitting] = useState(false);

  const { labels, hints, validationMsgs, validateOptions } = useChallengeFormMessages(1);
  const form = useChallengeForm({
    initial: defaultCreateFormInitial(),
    validationMsgs,
    validateOptions,
    hints,
  });

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
      await createChallenge(form.getPayload(), user);
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

      <ChallengeFormFields
        labels={labels}
        values={form.values}
        startAtMin={form.startAtMin}
        endMin={form.endMin}
        handlers={{
          onTitleChange: form.onTitleChange,
          onGoalKmChange: form.onGoalKmChange,
          onMaxMembersChange: form.onMaxMembersChange,
          onStartAtChange: form.onStartAtChange,
          onEndAtChange: form.onEndAtChange,
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
