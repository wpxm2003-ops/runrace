"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { PageLayout } from "@/app/_components/PageLayout";
import { Badge } from "@/app/_components/ui/Badge";
import { Card } from "@/app/_components/ui/Card";
import { LoadingCard } from "@/app/_components/ui/LoadingCard";
import { TextInput } from "@/app/_components/ui/TextInput";
import { usePersonalBests, useTrainingPlan, saveTrainingPlan, cancelTrainingPlan } from "@/lib/api";
import type { PersonalBestRow } from "@/lib/api/types";
import { useAuthUser } from "@/lib/useAuthUser";
import { redirectToLogin } from "@/lib/auth";
import { nativeNavigate } from "@/lib/nativeNav";
import { useConfirm } from "@/app/_components/ConfirmProvider";
import { clearNsmProgress } from "@/lib/nsmSessionProgress";
import { track } from "@/lib/analytics";
import { useLocale } from "@/lib/i18n";
import type { Translations } from "@/lib/i18n/translations";
import { toast } from "sonner";
import {
  vdotFromRace,
  thresholdPaceSecPerKm,
  weeklyPlan,
  formatPaceSec,
  nsmTodayIndex,
  isRealisticThreshold,
  hasAdjacentSubTDays,
  subTDayLimits,
  clampSubTDaysToBand,
  isOverBandDose,
  type NsmSession,
  type NsmVolumeBand,
} from "@/lib/nsm";
import { weekdayLabels } from "@/lib/format";
import { sessionJson } from "@/lib/safeStorage";

// 비로그인 계산 결과가 로그인 리다이렉트로 유실되지 않도록 입력값을 잠시 보관한다(같은 탭 세션 한정).
type NsmDraft = { distM: number; timeStr: string; subTDays: number[]; band?: NsmVolumeBand };
const nsmDraftStore = sessionJson<NsmDraft>("nsm_calc_draft");

const DISTANCES = [
  { label: "5K", m: 5000 },
  { label: "10K", m: 10000 },
  { label: "Half", m: 21097 },
];
const PB_LABEL: Record<string, string> = {
  "3k": "3K",
  "5k": "5K",
  "10k": "10K",
  half: "Half",
  marathon: "Full",
};


function parseTime(v: string): number | null {
  const m = v.trim().match(/^(\d{1,3}):(\d{2})$/);
  if (!m) return null;
  const min = Number(m[1]);
  const sec = Number(m[2]);
  if (sec >= 60) return null; // 초는 0~59
  if (min > 240) return null; // 상한 4시간 — 오타/비정상 입력 차단
  return min * 60 + sec;
}
/** 숫자 키패드에는 콜론이 없으므로 입력 숫자만 받아 mm:ss로 자동 포맷 (2200 → 22:00) */
function maskTimeInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 5);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, -2)}:${digits.slice(-2)}`;
}
function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
function pbTimeSec(pb: PersonalBestRow): number {
  return Math.round((pb.bestPaceSec * pb.distanceM) / 1000);
}
function daysSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 86400000;
}

function volumeBandLabel(b: NsmVolumeBand, t: Translations): string {
  switch (b) {
    case 0: return t.nsm_volume_band_0;
    case 1: return t.nsm_volume_band_1;
    case 2: return t.nsm_volume_band_2;
    case 3: return t.nsm_volume_band_3;
    case 4: return t.nsm_volume_band_4;
  }
}

function sessionLabel(s: NsmSession, t: Translations): { title: string; sub: string; tag: string } {
  if (s.kind === "EASY") return { title: t.nsm_easy_title, sub: t.nsm_easy_sub, tag: "EASY" };
  if (s.kind === "LONGRUN") return { title: t.nsm_longrun_title, sub: t.nsm_longrun_sub, tag: "LONG RUN" };
  const name = s.kind === "SHORT" ? "Short" : s.kind === "MEDIUM" ? "Medium" : "Long";
  const title = `${name} — ${s.reps} × ${s.repAmount}${s.repUnit}`;
  const sub = s.targetPaceSec ? t.nsm_session_sub(formatPaceSec(s.targetPaceSec), s.restSec ?? 0) : "";
  return { title, sub, tag: "sub-T" };
}

type Result = {
  vdot: number;
  threshold: number;
  plan: NsmSession[];
  sourceDistanceM: number;
  sourceTimeSec: number;
};

function TrainingContent({ user }: { user: User | null }) {
  const { t, locale } = useLocale();
  const confirm = useConfirm();
  const { data: pbs } = usePersonalBests(user);
  const { data: savedPlan, mutate: mutatePlan } = useTrainingPlan(user);

  const days = weekdayLabels(locale, true);

  const [distM, setDistM] = useState(5000);
  const [timeStr, setTimeStr] = useState("22:00");
  // sub-T 요일(월=0…일=6). 기본 화·목·토 — 사용자가 자기 일정에 맞게 변경.
  const [subTDays, setSubTDays] = useState<number[]>([1, 3, 5]);
  const [band, setBand] = useState<NsmVolumeBand | undefined>(undefined);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [canceling, setCanceling] = useState(false);

  // 저장된 플랜을 최초 1회 화면에 복원. ref 가드로 늦게 도착해도(SWR 지연) 반드시 1회 적용.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;

    // 서버 플랜이 없으면 — 비로그인 계산 후 로그인 복귀 등 — 임시 저장된 초안을 복원(1회성).
    if (!savedPlan) {
      const draft = nsmDraftStore.get();
      if (draft && !result) {
        hydratedRef.current = true;
        nsmDraftStore.remove();
        setSubTDays(draft.subTDays);
        setDistM(draft.distM);
        setTimeStr(draft.timeStr);
        setBand(draft.band);
        const sec = parseTime(draft.timeStr);
        if (sec != null && sec > 0) compute(draft.distM, sec, draft.subTDays, draft.band);
      }
      return;
    }

    hydratedRef.current = true;
    if (result) return; // 사용자 계산값 우선 — 클로버 방지
    // 오염 행(문자열 "Infinity"/NaN vdot 등) 방어 — 유한값이 아니면 복원 스킵.
    const savedVdot = Number(savedPlan.vdot);
    if (!Number.isFinite(savedVdot) || !Number.isFinite(savedPlan.thresholdPaceSec)) return;
    const savedBand = (savedPlan.weeklyBand ?? undefined) as NsmVolumeBand | undefined;
    setSubTDays(savedPlan.subTDays);
    setDistM(savedPlan.sourceDistanceM);
    setTimeStr(formatTime(savedPlan.sourceTimeSec));
    setBand(savedBand);
    setResult({
      vdot: savedVdot,
      threshold: savedPlan.thresholdPaceSec,
      plan: weeklyPlan(savedPlan.thresholdPaceSec, savedPlan.subTDays, savedBand),
      sourceDistanceM: savedPlan.sourceDistanceM,
      sourceTimeSec: savedPlan.sourceTimeSec,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedPlan]);

  // 계산 성공 시 true. 거리·시간 조합이 비현실적이면 에러 노출 후 false(결과 미표시).
  function compute(dM: number, sec: number, dys: number[], b: NsmVolumeBand | undefined = band): boolean {
    const vdot = vdotFromRace(dM, sec);
    const threshold = thresholdPaceSecPerKm(vdot);
    if (!isRealisticThreshold(threshold)) {
      setError(t.nsm_range_error);
      setResult(null);
      return false;
    }
    setError(null);
    setResult({ vdot, threshold, plan: weeklyPlan(threshold, dys, b), sourceDistanceM: dM, sourceTimeSec: sec });
    return true;
  }

  function onCalc() {
    const sec = parseTime(timeStr);
    if (sec == null || sec <= 0) {
      setError(t.nsm_time_error);
      setResult(null);
      return;
    }
    compute(distM, sec, subTDays);
  }

  function onPickPb(pb: PersonalBestRow) {
    const sec = pbTimeSec(pb);
    setDistM(pb.distanceM);
    setTimeStr(formatTime(sec));
    setError(null);
    compute(pb.distanceM, sec, subTDays);
  }

  // sub-T 요일 토글 — 밴드별 최소/최대 유지(미지정 시 2~3, 밴드별로 1~3).
  function onToggleDay(d: number) {
    const { min, max } = subTDayLimits(band);
    let next: number[];
    if (subTDays.includes(d)) {
      if (subTDays.length <= min) return;
      next = subTDays.filter((x) => x !== d);
    } else {
      if (subTDays.length >= max) return;
      next = [...subTDays, d].sort((a, b) => a - b);
    }
    setSubTDays(next);
    if (result) setResult({ ...result, plan: weeklyPlan(result.threshold, next, band) });
  }

  function onSelectBand(b: NsmVolumeBand) {
    const nextDays = clampSubTDaysToBand(subTDays, b);
    setBand(b);
    setSubTDays(nextDays);
    if (result) setResult({ ...result, plan: weeklyPlan(result.threshold, nextDays, b) });
  }

  async function onSave() {
    if (!result || saving || !user) return;
    setSaving(true);
    try {
      // 백엔드 계약(밴드별 1~3개, dedup·정렬)과 동일하게 정규화해 전송 — 프론트/백 상한 정책 일치.
      const normalizedDays = Array.from(new Set(subTDays)).sort((a, b) => a - b).slice(0, 3);
      await saveTrainingPlan(
        {
          vdot: result.vdot,
          thresholdPaceSec: result.threshold,
          subTDays: normalizedDays,
          sourceDistanceM: result.sourceDistanceM,
          sourceTimeSec: result.sourceTimeSec,
          weeklyBand: band,
        },
        user,
      );
      await mutatePlan();
      void track("nsm_plan_saved", { weekly_band: band ?? "unknown" });
      toast.success(t.nsm_toast_saved);
    } catch {
      toast.error(t.nsm_toast_save_fail);
    } finally {
      setSaving(false);
    }
  }

  async function onCancel() {
    if (!user || canceling) return;
    const ok = await confirm({
      title: t.nsm_cancel_title,
      message: t.nsm_cancel_message,
      confirmLabel: t.nsm_cancel_confirm,
      cancelLabel: t.nsm_cancel_keep,
      destructive: true,
    });
    if (!ok) return;
    setCanceling(true);
    try {
      await cancelTrainingPlan(user);
      // 캐시를 즉시 비워 '오늘의 세션'·운동 페이지 NSM 가이드가 바로 사라지게 한다.
      await mutatePlan(null, { revalidate: false });
      setResult(null); // 화면을 플랜 없는 상태로 리셋
      hydratedRef.current = false;
      // 동일 구조로 플랜 재생성 시 stale 렙 상태가 복원되지 않도록 진행상태 정리.
      clearNsmProgress();
      toast.success(t.nsm_toast_canceled);
    } catch {
      toast.error(t.nsm_toast_cancel_fail);
    } finally {
      setCanceling(false);
    }
  }

  const sortedKey = (a: number[]) => [...a].sort((x, y) => x - y).join(",");
  const isSaved =
    savedPlan != null &&
    result != null &&
    savedPlan.thresholdPaceSec === result.threshold &&
    savedPlan.sourceDistanceM === result.sourceDistanceM &&
    savedPlan.sourceTimeSec === result.sourceTimeSec &&
    (savedPlan.weeklyBand ?? undefined) === band &&
    sortedKey(savedPlan.subTDays) === sortedKey(subTDays);

  // "오늘의 세션"은 저장된 활성 플랜에서만 — 계산만 한 미저장 플랜은 미노출.
  const todaySession = savedPlan
    ? weeklyPlan(savedPlan.thresholdPaceSec, savedPlan.subTDays, (savedPlan.weeklyBand ?? undefined) as NsmVolumeBand | undefined)[nsmTodayIndex()]
    : null;

  return (
    <PageLayout title={t.nsm_title}>
      {savedPlan?.updatedAt && daysSince(savedPlan.updatedAt) >= 28 ? (
        <Card className="border-amber-300 bg-amber-50">
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
        <Card className="border-zinc-900 bg-zinc-900 text-white">
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
        </Card>
      ) : (
        <Card>
          <p className="text-xs leading-relaxed text-zinc-500">{t.nsm_intro}</p>
        </Card>
      )}

      {pbs && pbs.length > 0 ? (
        <Card className="mt-4">
          <div className="text-sm font-semibold text-zinc-900">{t.nsm_pb_heading}</div>
          <p className="mt-0.5 text-[11px] text-zinc-500">{t.nsm_pb_hint}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {pbs.map((pb) => (
              <button
                key={pb.distanceKey}
                type="button"
                onClick={() => onPickPb(pb)}
                className="rounded-full border border-zinc-300 bg-white px-3.5 py-2 text-sm hover:border-zinc-900 hover:bg-zinc-50"
              >
                <span className="font-semibold text-zinc-900">{PB_LABEL[pb.distanceKey] ?? pb.distanceKey}</span>
                <span className="ml-1.5 text-zinc-500">{formatTime(pbTimeSec(pb))}</span>
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
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
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
            onClick={onCalc}
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
              onClick={() => onSelectBand(b)}
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
                onClick={() => onToggleDay(d)}
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
                onClick={() => {
                  // 로그인 리다이렉트로 계산 결과가 유실되지 않게 입력값을 잠시 보관.
                  nsmDraftStore.set({ distM, timeStr, subTDays, band });
                  redirectToLogin("/training");
                }}
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
                onClick={onSave}
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
                      isToday ? "border-zinc-900 bg-zinc-50" : s.isSubT ? "border-zinc-200" : "border-zinc-100"
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
                            s.isSubT ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-500"
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
          onClick={onCancel}
          disabled={canceling}
          className="mt-4 w-full rounded-lg border border-red-200 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          {t.nsm_cancel_btn}
        </button>
      ) : null}
    </PageLayout>
  );
}

export default function TrainingPage() {
  // 비로그인도 계산까지 가능 — 저장/오늘의세션만 로그인 필요.
  const { user, loading } = useAuthUser();
  const { t } = useLocale();

  if (loading) {
    return (
      <PageLayout title={t.nsm_title}>
        <LoadingCard />
      </PageLayout>
    );
  }

  return <TrainingContent user={user ?? null} />;
}
