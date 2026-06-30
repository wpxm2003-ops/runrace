"use client";

import { PageLayout } from "@/app/_components/PageLayout";
import { ChallengeFormFields } from "@/app/challenges/_components/ChallengeFormFields";
import { useChallengeForm } from "@/app/challenges/_components/useChallengeForm";
import { useChallengeFormMessages } from "@/app/challenges/_components/useChallengeFormMessages";
import { AccordionRow } from "@/app/challenges/_components/AccordionRow";
import { PrizeEditorModal } from "@/app/challenges/_components/PrizeEditorModal";
import { useChallengeDetail, updateChallenge, invalidateChallengeLists, toDisplayError } from "@/lib/api";
import { usePrizes, invalidatePrizes } from "@/lib/api/hooks";
import { savePrizes } from "@/lib/api/prizes";
import { challengeDetailHref, challengeEditHref, parseChallengeIdFromPath } from "@/lib/challengeRoute";
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
  const [prizes, setPrizes] = useState<PrizeFormItem[]>([]);
  const [prizeOpen, setPrizeOpen] = useState(false);
  const [prizeModalOpen, setPrizeModalOpen] = useState(false);
  const [prizesModified, setPrizesModified] = useState(false);
  const prizesInitializedRef = useRef(false);

  const { labels, hints, validationMsgs, validateOptions } =
    useChallengeFormMessages(memberCount);
  const form = useChallengeForm({ validationMsgs, validateOptions, hints });

  const { data: detail, isLoading, error: fetchError } = useChallengeDetail(id, user);
  const { data: prizeData } = usePrizes(id, user);

  const maxRank = Math.max(1, Math.min(parseInt(form.values.maxMembers || "0", 10) || 10, 10));

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
    }));
    setPrizes(items);
    if (items.length > 0) setPrizeOpen(true);
  }, [prizeData]);

  // id 변경 시 초기화 상태 리셋
  useEffect(() => {
    initializedIdRef.current = null;
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
        extraSection={
          <AccordionRow
            label={t.prize_section_title}
            active={prizes.length > 0}
            open={prizeOpen}
            onToggle={() => setPrizeOpen((v) => !v)}
          >
            <p className="text-[11px] leading-relaxed text-zinc-400">
              {t.prize_section_hint(maxRank)}
            </p>
            {prizes.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {prizes.map((p) => (
                  <li key={p.rank} className="flex items-center gap-2 text-sm text-zinc-700">
                    <span className="font-semibold text-zinc-900">{t.prize_rank_label(p.rank)}</span>
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    {p.imageKey ? (
                      <span className="shrink-0 text-[10px] text-emerald-600">{t.prize_has_image_badge}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
            <button
              type="button"
              onClick={() => { if (user) setPrizeModalOpen(true); }}
              className="mt-2 rounded-xl border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
            >
              {prizes.length ? t.prize_edit_btn : t.prize_add_btn}
            </button>
          </AccordionRow>
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
          onSave={(items) => { setPrizes(items); setPrizesModified(true); }}
          onClose={() => setPrizeModalOpen(false)}
        />
      ) : null}
    </PageLayout>
  );
}
