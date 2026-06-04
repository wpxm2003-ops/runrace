"use client";

import { PageLayout } from "@/app/_components/PageLayout";
import { ChallengeFormFields } from "@/app/challenges/_components/ChallengeFormFields";
import { useChallengeForm } from "@/app/challenges/_components/useChallengeForm";
import { useChallengeFormMessages } from "@/app/challenges/_components/useChallengeFormMessages";
import { fetchChallengeDetail, updateChallenge } from "@/lib/api";
import { challengeDetailHref, challengeEditHref, parseChallengeId } from "@/lib/challengeRoute";
import { toDateTimeInputValue } from "@/lib/format";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useLocale } from "@/lib/i18n";
import { nativeNavigate } from "@/lib/nativeNav";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export default function ChallengeEditContent() {
  const params = useParams();
  const id = useMemo(() => parseChallengeId(String(params?.id ?? "")), [params?.id]);
  const { user } = useRequireAuth(id ? challengeEditHref(id) : undefined);
  const { t } = useLocale();
  const [memberCount, setMemberCount] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const { labels, hints, validationMsgs, validateOptions } =
    useChallengeFormMessages(memberCount);
  const form = useChallengeForm({
    validationMsgs,
    validateOptions,
    hints,
  });

  useEffect(() => {
    if (!id) {
      setLoadError(t.detail_no_id);
      return;
    }
    if (!user) return;
    fetchChallengeDetail(id, user)
      .then((d) => {
        if (!d.showManage) {
          nativeNavigate(challengeDetailHref(id));
          return;
        }
        setMemberCount(d.memberCount);
        form.reset({
          title: d.title,
          goalKm: String(d.goalKm),
          maxMembers: String(d.maxMembers),
          startAt: toDateTimeInputValue(d.startAt),
          endAt: d.endAt ? toDateTimeInputValue(d.endAt) : "",
        });
        setLoaded(true);
      })
      .catch((e) => setLoadError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- id·user 변경 시에만 재조회
  }, [id, user, t.detail_no_id]);

  async function onSubmit() {
    if (!user || !id || !loaded) return;
    form.clearFeedback();
    const validationError = form.validate();
    if (validationError) {
      form.setFormError(validationError);
      return;
    }
    setSubmitting(true);
    try {
      await updateChallenge(id, form.getPayload(), user);
      nativeNavigate(challengeDetailHref(id));
    } catch (e) {
      form.setFormError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  const error = form.formError ?? loadError;

  return (
    <PageLayout title={t.edit_title}>
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
        submitLabel={t.edit_btn}
        submitBusyLabel={t.edit_btn_busy}
        submitting={submitting}
        disabled={!loaded || !!loadError}
        onSubmit={onSubmit}
      />
    </PageLayout>
  );
}
