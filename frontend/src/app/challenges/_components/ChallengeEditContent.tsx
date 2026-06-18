"use client";

import { PageLayout } from "@/app/_components/PageLayout";
import { ChallengeFormFields } from "@/app/challenges/_components/ChallengeFormFields";
import { useChallengeForm } from "@/app/challenges/_components/useChallengeForm";
import { useChallengeFormMessages } from "@/app/challenges/_components/useChallengeFormMessages";
import { useChallengeDetail, updateChallenge, invalidateChallengeLists } from "@/lib/api";
import { challengeDetailHref, challengeEditHref, parseChallengeIdFromPath } from "@/lib/challengeRoute";
import { toDateTimeInputValue } from "@/lib/format";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import { goalInputFromKm } from "@/lib/units";
import { nativeNavigate } from "@/lib/nativeNav";
import { useRouteId } from "@/lib/useRouteId";
import { useEffect, useRef, useState } from "react";

export default function ChallengeEditContent() {
  const id = useRouteId(parseChallengeIdFromPath);
  const { user } = useRequireAuth(id ? challengeEditHref(id) : undefined);
  const { t } = useLocale();
  const { unit } = useUnit();
  const [memberCount, setMemberCount] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  // 현재 id에 대해 폼 초기화가 완료됐는지 추적 (SWR 재검증 시 form.reset 중복 방지)
  const initializedIdRef = useRef<number | null>(null);

  const { labels, hints, validationMsgs, validateOptions } =
    useChallengeFormMessages(memberCount);
  const form = useChallengeForm({
    validationMsgs,
    validateOptions,
    hints,
  });

  const {
    data: detail,
    isLoading,
    error: fetchError,
  } = useChallengeDetail(id, user);

  // 상세 데이터가 처음 로드됐을 때 폼 초기화
  useEffect(() => {
    if (!detail || !id || initializedIdRef.current === id) return;

    if (!detail.showManage) {
      nativeNavigate(challengeDetailHref(id));
      return;
    }

    initializedIdRef.current = id;
    setMemberCount(detail.memberCount);
    form.reset({
      title: detail.title,
      goalKm: goalInputFromKm(detail.goalKm, unit),
      maxMembers: String(detail.maxMembers),
      startAt: toDateTimeInputValue(detail.startAt),
      endAt: detail.endAt ? toDateTimeInputValue(detail.endAt) : "",
      stake: detail.stake ?? "",
    });
  }, [detail, id, unit, form]);

  // id가 바뀌면 초기화 상태 리셋
  useEffect(() => {
    initializedIdRef.current = null;
  }, [id]);

  const loaded = initializedIdRef.current === id && !!detail;
  const loadError = !id ? t.detail_no_id : (fetchError ? String(fetchError) : null);

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
      invalidateChallengeLists();
      nativeNavigate(challengeDetailHref(id));
    } catch (e) {
      form.setFormError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  const error = form.formError ?? loadError;
  const showLoading = isLoading && !detail;

  return (
    <PageLayout title={t.edit_title}>
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
        submitLabel={t.edit_btn}
        submitBusyLabel={t.edit_btn_busy}
        submitting={submitting}
        disabled={showLoading || !loaded || !!loadError}
        onSubmit={onSubmit}
      />
    </PageLayout>
  );
}
