"use client";

import { PageLayout } from "@/app/_components/PageLayout";
import { NavListLink } from "@/app/_components/NavListLink";
import { Alert } from "@/app/_components/ui/Alert";
import { ChallengeFormFields } from "@/app/challenges/_components/ChallengeFormFields";
import {
  defaultCreateFormInitial,
  useChallengeForm,
} from "@/app/challenges/_components/useChallengeForm";
import { useChallengeFormMessages } from "@/app/challenges/_components/useChallengeFormMessages";
import { createChallenge, invalidateChallengeLists, savePrizes, useActiveCount } from "@/lib/api";
import type { PrizeFormItem } from "@/lib/api/types";
import { PrizeEditorModal } from "@/app/challenges/_components/PrizeEditorModal";
import { minStartAtLocal, plusDaysLocal } from "@/lib/challengeForm";
import { RACE_TEMPLATES, type RaceTemplate, type RaceTemplateKey } from "@/lib/raceTemplates";
import { goalInputFromKm } from "@/lib/units";
import { track } from "@/lib/analytics";
import { toast } from "sonner";
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
  const [prizes, setPrizes] = useState<PrizeFormItem[]>([]);
  const [prizeModalOpen, setPrizeModalOpen] = useState(false);

  const { labels, hints, validationMsgs, validateOptions } = useChallengeFormMessages(1);
  const form = useChallengeForm({
    initial: defaultCreateFormInitial(),
    validationMsgs,
    validateOptions,
    hints,
  });

  // 경품 등수 상한 = min(정원, 10). 정원 입력이 비거나 잘못되면 10으로.
  const maxRank = Math.max(1, Math.min(parseInt(form.values.maxMembers || "0", 10) || 10, 10));

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
      const created = await createChallenge({ ...form.getPayload(), langCd: locale }, user);
      // 경품은 레이스 생성 후 별도 저장. 실패해도 레이스 생성은 유지하고 경고만.
      if (prizes.length > 0) {
        try {
          await savePrizes(created.id, prizes, user);
        } catch {
          toast.error(t.prize_save_failed);
        }
      }
      invalidateChallengeLists();
      void track("race_created");
      toast.success(t.create_success);
      nativeNavigate("/challenges");
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
      actions={<NavListLink href="/challenges" label={t.create_list_link} />}
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
        extraSection={
          <div className="mt-4">
            <p className="text-sm font-medium text-zinc-800">{t.prize_section_title}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">{t.prize_section_hint(maxRank)}</p>
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
              onClick={() => {
                if (user) setPrizeModalOpen(true);
              }}
              className="mt-2 rounded-xl border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
            >
              {prizes.length ? t.prize_edit_btn : t.prize_add_btn}
            </button>
          </div>
        }
        submitNotice={t.create_solo_notice}
        submitLabel={t.create_btn}
        submitBusyLabel={t.create_btn_busy}
        submitting={submitting}
        disabled={!canCreate}
        onSubmit={onSubmit}
      />

      {prizeModalOpen && user ? (
        <PrizeEditorModal
          prizes={prizes}
          maxRank={maxRank}
          user={user}
          onSave={setPrizes}
          onClose={() => setPrizeModalOpen(false)}
        />
      ) : null}
    </PageLayout>
  );
}
