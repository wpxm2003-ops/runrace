"use client";

import { PageLayout } from "@/app/_components/PageLayout";
import { ChallengeFormFields } from "@/app/challenges/_components/ChallengeFormFields";
import { useChallengeForm } from "@/app/challenges/_components/useChallengeForm";
import { useChallengeFormMessages } from "@/app/challenges/_components/useChallengeFormMessages";
import { PrizeAccordionSection } from "@/app/challenges/_components/PrizeAccordionSection";
import { PrizeEditorModal } from "@/app/challenges/_components/PrizeEditorModal";
import { useChallengeDetail, updateChallenge, invalidateChallengeLists, toDisplayError } from "@/lib/api";
import { usePrizes, invalidatePrizes } from "@/lib/api/hooks";
import { savePrizes } from "@/lib/api/prizes";
import { challengeDetailHref, challengeEditHref, parseChallengeIdFromPath } from "@/lib/challengeRoute";
import { prizeMaxRank } from "@/lib/challengeForm";
import { toDateTimeInputValue } from "@/lib/format";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import { goalInputFromKm } from "@/lib/units";
import { nativeNavigate } from "@/lib/nativeNav";
import { toast } from "sonner";
import { useRouteId } from "@/lib/useRouteId";
import type { PrizeFormItem } from "@/lib/api/types";
import { useEffect, useRef, useState } from "react";

export default function ChallengeEditContent() {
  const id = useRouteId(parseChallengeIdFromPath);
  const { user } = useRequireAuth(id ? challengeEditHref(id) : undefined);
  const { t } = useLocale();
  const { unit } = useUnit();
  const [memberCount, setMemberCount] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const initializedIdRef = useRef<number | null>(null);

  // 경품
  const [stakeOpen, setStakeOpen] = useState(false);
  const [prizes, setPrizes] = useState<PrizeFormItem[]>([]);
  const [prizeOpen, setPrizeOpen] = useState(false);
  const [prizeModalOpen, setPrizeModalOpen] = useState(false);
  const [prizesModified, setPrizesModified] = useState(false);
  const prizesInitializedRef = useRef(false);

  const { labels, hints, validationMsgs, validateOptions } =
    useChallengeFormMessages(memberCount);
  const form = useChallengeForm({ validationMsgs, validateOptions, hints });

  // 인증 복원 전에 익명 상세(showManage=false)를 받아 수정 화면이 상세로 튕기는 것을 막는다.
  const { data: detail, isLoading, error: fetchError } = useChallengeDetail(user ? id : null, user);
  const { data: prizeData } = usePrizes(id, user);

  const maxRank = prizeMaxRank(form.values.maxMembers);
  const stakeSelected = stakeOpen || !!form.values.stake;
  const prizeSelected = prizeOpen || prizes.length > 0;

  // 상세 데이터 최초 로드 시 폼 초기화
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

  // 기존 경품 한 번만 초기화
  useEffect(() => {
    if (!prizeData || prizesInitializedRef.current) return;
    prizesInitializedRef.current = true;
    const items: PrizeFormItem[] = prizeData.map((row) => ({
      rank: row.rank,
      name: row.name,
      imageKey: null,
      keepImage: row.hasImage,
      // 원본 등수를 기록해 두면 편집 중 순서가 바뀌어도 이미지를 정확히 보존한다.
      keepImageFromRank: row.hasImage ? row.rank : null,
    }));
    setPrizes(items);
    if (items.length > 0) setPrizeOpen(true);
  }, [prizeData]);

  // id 변경 시 초기화 상태 리셋
  useEffect(() => {
    initializedIdRef.current = null;
    setStakeOpen(false);
    prizesInitializedRef.current = false;
    setPrizesModified(false);
  }, [id]);

  const loaded = initializedIdRef.current === id && !!detail;
  const loadError = !id ? t.detail_no_id : toDisplayError(fetchError);

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
      if (prizesModified) {
        try {
          await savePrizes(id, prizes, user);
          invalidatePrizes(id);
        } catch {
          toast.error(t.prize_save_failed);
        }
      }
      invalidateChallengeLists();
      toast.success(t.toast_race_updated);
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
        stakeDisabled={prizeSelected && !stakeSelected}
        stakeDisabledHint={t.reward_mutually_exclusive}
        onStakeOpenChange={setStakeOpen}
        extraSection={
          <PrizeAccordionSection
            prizes={prizes}
            maxRank={maxRank}
            open={prizeOpen}
            onToggle={() => setPrizeOpen((v) => !v)}
            onEdit={() => { if (user) setPrizeModalOpen(true); }}
            disabled={stakeSelected && !prizeSelected}
            disabledHint={t.reward_mutually_exclusive}
          />
        }
        submitLabel={t.edit_btn}
        submitBusyLabel={t.edit_btn_busy}
        submitting={submitting}
        disabled={showLoading || !loaded || !!loadError}
        onSubmit={onSubmit}
      />

      {prizeModalOpen && user ? (
        <PrizeEditorModal
          prizes={prizes}
          maxRank={maxRank}
          user={user}
          challengeId={id ?? undefined}
          onSave={(items) => { setPrizes(items); setPrizesModified(true); }}
          onClose={() => setPrizeModalOpen(false)}
        />
      ) : null}
    </PageLayout>
  );
}
