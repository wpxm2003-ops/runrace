"use client";

import type { User } from "firebase/auth";
import { PageLayout } from "@/app/_components/PageLayout";
import { Badge } from "@/app/_components/ui/Badge";
import { Card } from "@/app/_components/ui/Card";
import { LoadingCard } from "@/app/_components/ui/LoadingCard";
import { TextInput } from "@/app/_components/ui/TextInput";
import { useAuthUser } from "@/lib/useAuthUser";
import { nativeNavigate } from "@/lib/nativeNav";
import { usePageScrollRestore } from "@/lib/pageStateStore";
import { useLocale } from "@/lib/i18n";
import {
  formatPaceSec,
  nsmTodayIndex,
  hasAdjacentSubTDays,
  isOverBandDose,
} from "@/lib/nsm";
import { weekdayLabels } from "@/lib/format";
import { pbFinishSec } from "@/lib/paceMath";
import { NsmIntroCard } from "@/app/training/_components/NsmIntroCard";
import { useTrainingPlanBuilder } from "@/app/training/_hooks/useTrainingPlanBuilder";
import {
  DISTANCES,
  PB_LABEL,
  daysSince,
  formatTime,
  maskTimeInput,
  sessionLabel,
  volumeBandLabel,
} from "@/app/training/trainingUtils";

function TrainingContent({ user }: { user: User | null }) {
  const { t, locale } = useLocale();
  // 다른 화면에 다녀와도 스크롤 유지 (내정보 탭과 동일 동작)
  usePageScrollRestore("page:training");
  const days = weekdayLabels(locale, true);
  const plan = useTrainingPlanBuilder(user, t);
  const {
    pbs, savedPlan, weekly, distM, setDistM, timeStr, setTimeStr, subTDays, band,
    result, error, saving, canceling, isSaved, todaySession,
    calculate, pickPersonalBest, toggleDay, selectBand, save, cancel, continueToLogin,
  } = plan;

  return (
    <PageLayout title={t.nsm_title}>
      <NsmIntroCard />

      {savedPlan?.updatedAt && daysSince(savedPlan.updatedAt) >= 28 ? (
        <Card className="mt-4 border-amber-300 bg-amber-50">
          <p className="text-xs leading-relaxed text-amber-800">{t.nsm_retest_banner}</p>
          <button
            type="button"
            onClick={() =>
              document.getElementById("nsm-manual-heading")?.scrollIntoView({ behavior: "smooth", block: "center" })
            }
            className="mt-2 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800"
          >
            {t.nsm_retest_cta}
          </button>
        </Card>
      ) : null}
      {todaySession ? (
        <Card className="mt-4 border-zinc-900 bg-zinc-900 text-white">
          <div className="text-xs text-zinc-400">
            {t.nsm_today} ({days[nsmTodayIndex()]}) {t.nsm_session}
          </div>
          {(() => {
            const { title, sub } = sessionLabel(todaySession, t);
            return (
              <>
                <div className="mt-1 text-lg font-bold">{title}</div>
                <div className="mt-0.5 text-xs text-zinc-300">{sub}</div>
              </>
            );
          })()}
          <button
            type="button"
            onClick={() => nativeNavigate("/workout")}
            className="mt-3 w-full rounded-lg bg-white py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-100"
          >
            {t.nsm_session_start}
          </button>
          {!todaySession.isSubT ? (
            <p className="mt-2 text-[11px] text-zinc-400">{t.nsm_today_easy_note}</p>
          ) : null}
          {weekly && weekly.planned > 0 ? (
            <p className="mt-2 text-[11px] text-zinc-400">
              {t.nsm_week_progress(weekly.completed, weekly.planned)}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => nativeNavigate("/training/report")}
            className="mt-2 text-[11px] font-medium text-zinc-300 underline underline-offset-2 hover:text-white"
          >
            📈 {t.nsm_report_link}
          </button>
        </Card>
      ) : null}

      {pbs && pbs.length > 0 ? (
        <Card className="mt-4">
          <div className="text-sm font-semibold text-zinc-900">{t.nsm_pb_heading}</div>
          <p className="mt-0.5 text-[11px] text-zinc-500">{t.nsm_pb_hint}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {pbs.map((pb) => (
              <button
                key={pb.distanceKey}
                type="button"
                onClick={() => pickPersonalBest(pb)}
                className="rounded-full border border-zinc-300 bg-white px-3.5 py-2 text-sm hover:border-zinc-900 hover:bg-zinc-50"
              >
                <span className="font-semibold text-zinc-900">{PB_LABEL[pb.distanceKey] ?? pb.distanceKey}</span>
                <span className="ml-1.5 text-zinc-500">{formatTime(pbFinishSec(pb.bestPaceSec, pb.distanceM))}</span>
              </button>
            ))}
          </div>
        </Card>
      ) : null}

      <div id="nsm-manual-heading">
      <Card className="mt-4">
        <div className="text-sm font-semibold text-zinc-900">{t.nsm_manual_heading}</div>
        <div className="mt-3 flex flex-col gap-3">
          <label className="block">
            <span className="text-xs font-medium text-zinc-600">{t.nsm_race_distance}</span>
            <div className="mt-1 flex gap-2">
              {DISTANCES.map((d) => (
                <button
                  key={d.m}
                  type="button"
                  onClick={() => setDistM(d.m)}
                  className={`flex-1 rounded-lg border px-2 py-2 text-sm ${
                    distM === d.m ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 bg-white text-zinc-700"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-zinc-600">{t.nsm_record_label}</span>
            <TextInput
              type="text"
              inputMode="numeric"
              value={timeStr}
              onChange={(e) => setTimeStr(maskTimeInput(e.target.value))}
              placeholder="22:00"
              className="w-32"
            />
          </label>
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
          <button
            type="button"
            onClick={calculate}
            className="rounded-lg bg-zinc-900 py-2.5 text-sm text-white hover:bg-zinc-800"
          >
            {t.nsm_calc_button}
          </button>
        </div>
      </Card>
      </div>

      <Card className="mt-4">
        <div className="text-xs font-medium text-zinc-600">{t.nsm_volume_heading}</div>
        <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">{t.nsm_volume_hint}</p>
        <div className="mt-2 flex gap-1.5">
          {([0, 1, 2, 3, 4] as const).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => selectBand(b)}
              className={`h-10 flex-1 rounded-lg border text-xs font-medium ${
                band === b ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 bg-white text-zinc-600"
              }`}
            >
              {volumeBandLabel(b, t)}
            </button>
          ))}
        </div>
      </Card>

      <Card className="mt-4">
        <div className="text-xs font-medium text-zinc-600">{t.nsm_subt_days_label}</div>
        <div className="mt-2 flex gap-1.5">
          {days.map((label, d) => {
            const on = subTDays.includes(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(d)}
                className={`h-10 flex-1 rounded-lg border text-sm font-medium ${
                  on ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 bg-white text-zinc-600"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">{t.nsm_subt_days_hint}</p>
        {hasAdjacentSubTDays(subTDays) ? (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
            {t.nsm_subt_adjacent_warning}
          </p>
        ) : null}
        {result && isOverBandDose(result.plan, band) ? (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
            {t.nsm_dose_warning}
          </p>
        ) : null}
      </Card>

      {result ? (
        <>
          <Card className="mt-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-zinc-500">{t.nsm_threshold_label}</div>
                <div className="mt-0.5 text-2xl font-bold text-zinc-900">
                  {formatPaceSec(result.threshold)}
                  <span className="ml-1 text-base font-medium text-zinc-400">/km</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-zinc-500">VDOT</div>
                <div className="mt-0.5 text-2xl font-bold text-zinc-900">{result.vdot.toFixed(1)}</div>
              </div>
            </div>
            {!user ? (
              <button
                type="button"
                onClick={continueToLogin}
                className="mt-3 w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-semibold text-white"
              >
                {t.nsm_signup_cta}
              </button>
            ) : isSaved ? (
              <div className="mt-3 rounded-lg bg-zinc-100 py-2 text-center text-xs font-medium text-zinc-500">
                {t.nsm_saved}
              </div>
            ) : (
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="mt-3 w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? t.nsm_saving : t.nsm_save_start}
              </button>
            )}
          </Card>

          <Card className="mt-4">
            <div className="text-base font-semibold">{t.nsm_week_heading}</div>
            <div className="mt-3 flex flex-col gap-2">
              {result.plan.map((s) => {
                const { title, sub, tag } = sessionLabel(s, t);
                const isToday = s.day === nsmTodayIndex();
                return (
                  <div
                    key={s.day}
                    className={`flex items-start gap-3 rounded-xl border p-3 ${
                      isToday ? "border-brand bg-brand-soft" : s.isSubT ? "border-line" : "border-zinc-100"
                    }`}
                  >
                    <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-600">
                      {days[s.day]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-zinc-900">{title}</span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            s.isSubT ? "bg-brand text-night" : "bg-zinc-100 text-zinc-500"
                          }`}
                        >
                          {tag}
                        </span>
                        {isToday ? <Badge tone="emerald">{t.nsm_today}</Badge> : null}
                      </div>
                      <div className="mt-0.5 text-[11px] text-zinc-500">{sub}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-zinc-400">{t.nsm_week_note}</p>
          </Card>
        </>
      ) : null}

      {user && savedPlan ? (
        <button
          type="button"
          onClick={cancel}
          disabled={canceling}
          className="mt-4 w-full rounded-lg border border-red-200 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          {t.nsm_cancel_btn}
        </button>
      ) : null}
    </PageLayout>
  );
}

export default function TrainingPageContent() {
  // 비로그인도 계산까지 가능 — 저장/오늘의세션만 로그인 필요.
  const { user, loading } = useAuthUser();
  const { t } = useLocale();

  if (loading) {
    return (
      <PageLayout title={t.nsm_title}>
        <NsmIntroCard />
        <div className="mt-4">
          <LoadingCard />
        </div>
      </PageLayout>
    );
  }

  return <TrainingContent user={user ?? null} />;
}
