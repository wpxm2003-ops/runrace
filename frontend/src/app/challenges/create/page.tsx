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
import { createChallenge, invalidateChallengeLists, invalidateCrewRaces, savePrizes, useActiveCount } from "@/lib/api";
import type { PrizeAwardType, PrizeFormItem } from "@/lib/api/types";
import { PrizeEditorModal } from "@/app/challenges/_components/PrizeEditorModal";
import { PrizeAccordionSection } from "@/app/challenges/_components/PrizeAccordionSection";
import { prizeMaxRank } from "@/lib/challengeForm";
import { RACE_TEMPLATES, raceTemplateWindow, type RaceTemplate, type RaceTemplateKey } from "@/lib/raceTemplates";
import { goalInputFromKm } from "@/lib/units";
import { track } from "@/lib/analytics";
import { toast } from "sonner";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useLocale } from "@/lib/i18n";
import { isCrewAvailable } from "@/lib/crewAccess";
import { useUnit } from "@/lib/UnitContext";
import { nativeNavigate } from "@/lib/nativeNav";
import { useEffect, useState } from "react";

export default function CreateChallengePage() {
  const { user } = useRequireAuth("/challenges/create");
  const { t, locale } = useLocale();
  const { unit } = useUnit();
  const [submitting, setSubmitting] = useState(false);
  const [prizes, setPrizes] = useState<PrizeFormItem[]>([]);
  const [prizeAwardType, setPrizeAwardType] = useState<PrizeAwardType>("RANK");
  const [stakeOpen, setStakeOpen] = useState(false);
  const [prizeOpen, setPrizeOpen] = useState(false);
  const [prizeModalOpen, setPrizeModalOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<RaceTemplateKey | null>(null);
  // 크루 홈에서 진입(?crew=1)하면 크루 내부 레이스로 생성 — 마운트 후 읽어 hydration mismatch 방지.
  // 크루가 공개되지 않은 로케일에서는 쿼리를 직접 붙여도 무시한다 — 허용하면 본인이 볼 수 없는
  // 크루 전용 레이스가 만들어진다(크루 화면은 라우트 가드로 막혀 있다).
  const [crewMode, setCrewMode] = useState(false);
  useEffect(() => {
    if (!isCrewAvailable(locale)) return;
    setCrewMode(new URLSearchParams(window.location.search).get("crew") === "1");
  }, [locale]);

  const { labels, hints, validationMsgs, validateOptions } = useChallengeFormMessages(1);
  const form = useChallengeForm({
    initial: defaultCreateFormInitial(),
    validationMsgs,
    validateOptions,
    hints,
  });

  const maxRank = prizeMaxRank(form.values.maxMembers);
  const stakeSelected = stakeOpen || !!form.values.stake;
  const prizeSelected = prizeOpen || prizes.length > 0;

  const templateNames: Record<RaceTemplateKey, string> = {
    today5: t.tpl_today5,
    weekend10: t.tpl_weekend10,
    week30: t.tpl_week30,
  };

  const templateLabels: Record<RaceTemplateKey, string> = {
    today5: t.tpl_today_label,
    weekend10: t.tpl_weekend_label,
    week30: t.tpl_popular_label,
  };

  const templateDescriptions: Record<RaceTemplateKey, string> = {
    today5: t.tpl_today5_desc,
    weekend10: t.tpl_weekend10_desc,
    week30: t.tpl_week30_desc,
  };

  // 추천 카드를 선택하면 제목·목표·일정을 채운다. 사용자는 이후 값을 자유롭게 조정할 수 있다.
  function applyTemplate(tpl: RaceTemplate) {
    const { startAt, endAt } = raceTemplateWindow(tpl.key);
    setSelectedTemplate(tpl.key);
    form.reset({
      title: templateNames[tpl.key],
      goalKm: goalInputFromKm(tpl.goalKm, unit),
      maxMembers: "10",
      startAt,
      endAt,
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
      const created = await createChallenge(
        { ...form.getPayload(), langCd: locale, ...(crewMode ? { crewOnly: true } : {}) },
        user,
      );
      // 경품은 레이스 생성 후 별도 저장. 실패해도 레이스 생성은 유지하고 경고만.
      if (prizes.length > 0) {
        try {
          await savePrizes(created.id, prizes, prizeAwardType, user);
        } catch {
          toast.error(t.prize_save_failed);
        }
      }
      invalidateChallengeLists();
      if (crewMode) invalidateCrewRaces(user.uid);
      void track("race_created", { crew: crewMode });
      toast.success(t.create_success);
      nativeNavigate(crewMode ? "/crew" : "/challenges");
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

      {crewMode ? (
        <div className="mb-4 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
          {t.create_crew_race_notice}
        </div>
      ) : null}

      {/* 추천 레이스 — 선택하면 제목·목표·일정이 자동으로 채워진다 */}
      <div className="mb-5">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <p className="text-base font-black tracking-tight text-zinc-950">{t.tpl_section_title}</p>
            <p className="mt-0.5 text-xs text-zinc-500">{t.tpl_section_desc}</p>
          </div>
        </div>
        <div className="grid gap-2.5">
          {RACE_TEMPLATES.map((tpl) => (
            <button
              key={tpl.key}
              type="button"
              onClick={() => applyTemplate(tpl)}
              aria-pressed={selectedTemplate === tpl.key}
              className={`group flex min-h-20 w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition-all active:scale-[0.99] ${
                selectedTemplate === tpl.key
                  ? "border-zinc-950 bg-zinc-950 text-white shadow-lg shadow-zinc-950/15"
                  : "border-zinc-200 bg-white text-zinc-950 shadow-sm hover:border-zinc-400"
              }`}
            >
              <span className="min-w-0">
                <span className={`text-[11px] font-bold ${selectedTemplate === tpl.key ? "text-orange-500" : "text-zinc-500"}`}>
                  {templateLabels[tpl.key]}
                </span>
                <span className="mt-0.5 block text-base font-black tracking-tight">{templateNames[tpl.key]}</span>
                <span className={`mt-0.5 block text-xs ${selectedTemplate === tpl.key ? "text-zinc-300" : "text-zinc-500"}`}>
                  {templateDescriptions[tpl.key]}
                </span>
              </span>
              <span className={`ml-3 shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black tracking-wider ${
                selectedTemplate === tpl.key ? "bg-orange-500 text-white" : "bg-orange-50 text-orange-600"
              }`}>
                {tpl.accent}
              </span>
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
        stakeDisabled={prizeSelected && !stakeSelected}
        stakeDisabledHint={t.reward_mutually_exclusive}
        onStakeOpenChange={setStakeOpen}
        extraSection={
          <PrizeAccordionSection
            prizes={prizes}
            awardType={prizeAwardType}
            maxRank={maxRank}
            open={prizeOpen}
            onToggle={() => setPrizeOpen((v) => !v)}
            onEdit={() => { if (user) setPrizeModalOpen(true); }}
            disabled={stakeSelected && !prizeSelected}
            disabledHint={t.reward_mutually_exclusive}
          />
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
          awardType={prizeAwardType}
          maxRank={maxRank}
          user={user}
          onSave={setPrizes}
          onAwardTypeChange={setPrizeAwardType}
          onClose={() => setPrizeModalOpen(false)}
        />
      ) : null}
    </PageLayout>
  );
}
