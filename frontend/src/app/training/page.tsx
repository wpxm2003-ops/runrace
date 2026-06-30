"use client";

// ⚠️ NSM 프로토타입(B-1) — 플랜 영속화 + 오늘의 세션. 문구는 한국어 하드코딩(i18n·확정 후).
// 접속: /training (로그인 필요). 런 중 렙 가이드(B-2)는 다음 단계.

import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { PageLayout } from "@/app/_components/PageLayout";
import { Card } from "@/app/_components/ui/Card";
import { LoadingCard } from "@/app/_components/ui/LoadingCard";
import { usePersonalBests, useTrainingPlan, saveTrainingPlan } from "@/lib/api";
import type { PersonalBestRow } from "@/lib/api/types";
import { useAuthUser } from "@/lib/useAuthUser";
import { redirectToLogin } from "@/lib/auth";
import { nativeNavigate } from "@/lib/nativeNav";
import { toast } from "sonner";
import {
  vdotFromRace,
  thresholdPaceSecPerKm,
  weeklyPlan,
  formatPaceSec,
  type NsmSession,
} from "@/lib/nsm";

const DISTANCES = [
  { label: "5K", m: 5000 },
  { label: "10K", m: 10000 },
  { label: "하프", m: 21097 },
];
const DAYS = ["월", "화", "수", "목", "금", "토", "일"];
const PB_LABEL: Record<string, string> = {
  "3k": "3K",
  "5k": "5K",
  "10k": "10K",
  half: "하프",
  marathon: "풀",
};

/** JS 요일(0=일)을 월=0…일=6 인덱스로 변환. */
function todayIndex(): number {
  return (new Date().getDay() + 6) % 7;
}

function parseTime(v: string): number | null {
  const m = v.trim().match(/^(\d{1,3}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}
function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
function pbTimeSec(pb: PersonalBestRow): number {
  return Math.round((pb.bestPaceSec * pb.distanceM) / 1000);
}

function sessionLabel(s: NsmSession): { title: string; sub: string; tag: string } {
  if (s.kind === "EASY") return { title: "이지런", sub: "편하게, 대화 가능한 느린 페이스", tag: "EASY" };
  if (s.kind === "LONGRUN") return { title: "롱런", sub: "길게, 이지 페이스로", tag: "LONG RUN" };
  const reps = `${s.reps} × ${s.repAmount}${s.repUnit}`;
  const pace = s.targetPaceSec ? `${formatPaceSec(s.targetPaceSec)}/km` : "";
  const rest = s.restSec ? ` · 휴식 ${s.restSec}초` : "";
  const name = s.kind === "SHORT" ? "Short" : s.kind === "MEDIUM" ? "Medium" : "Long";
  return { title: `${name} — ${reps}`, sub: `목표 ${pace}${rest}`, tag: "sub-T" };
}

type Result = {
  vdot: number;
  threshold: number;
  plan: NsmSession[];
  sourceDistanceM: number;
  sourceTimeSec: number;
};

function TrainingContent({ user }: { user: User | null }) {
  const { data: pbs } = usePersonalBests(user);
  const { data: savedPlan, mutate: mutatePlan } = useTrainingPlan(user);

  const [distM, setDistM] = useState(5000);
  const [timeStr, setTimeStr] = useState("22:00");
  // sub-T 요일(월=0…일=6). 기본 화·목·토 — 사용자가 자기 일정에 맞게 변경.
  const [subTDays, setSubTDays] = useState<number[]>([1, 3, 5]);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 저장된 플랜을 최초 1회 화면에 복원. ref 가드로 늦게 도착해도(SWR 지연) 반드시 1회 적용.
  // 사용자가 이미 계산(result)했으면 덮어쓰지 않는다.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!savedPlan || hydratedRef.current) return;
    hydratedRef.current = true;
    if (result) return; // 사용자 계산값 우선 — 클로버 방지
    setSubTDays(savedPlan.subTDays);
    setDistM(savedPlan.sourceDistanceM);
    setTimeStr(formatTime(savedPlan.sourceTimeSec));
    setResult({
      vdot: savedPlan.vdot,
      threshold: savedPlan.thresholdPaceSec,
      plan: weeklyPlan(savedPlan.thresholdPaceSec, savedPlan.subTDays),
      sourceDistanceM: savedPlan.sourceDistanceM,
      sourceTimeSec: savedPlan.sourceTimeSec,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedPlan]);

  function compute(dM: number, sec: number, days: number[]) {
    const vdot = vdotFromRace(dM, sec);
    const threshold = thresholdPaceSecPerKm(vdot);
    setResult({ vdot, threshold, plan: weeklyPlan(threshold, days), sourceDistanceM: dM, sourceTimeSec: sec });
  }

  function onCalc() {
    const sec = parseTime(timeStr);
    if (sec == null || sec <= 0) {
      setError("시간을 mm:ss 형식으로 입력해주세요 (예: 22:00)");
      setResult(null);
      return;
    }
    setError(null);
    compute(distM, sec, subTDays);
  }

  function onPickPb(pb: PersonalBestRow) {
    const sec = pbTimeSec(pb);
    setDistM(pb.distanceM);
    setTimeStr(formatTime(sec));
    setError(null);
    compute(pb.distanceM, sec, subTDays);
  }

  // sub-T 요일 토글 — 2~3개 유지(최소 2, 최대 3).
  function onToggleDay(d: number) {
    let next: number[];
    if (subTDays.includes(d)) {
      if (subTDays.length <= 2) return;
      next = subTDays.filter((x) => x !== d);
    } else {
      if (subTDays.length >= 3) return;
      next = [...subTDays, d].sort((a, b) => a - b);
    }
    setSubTDays(next);
    if (result) setResult({ ...result, plan: weeklyPlan(result.threshold, next) });
  }

  async function onSave() {
    if (!result || saving || !user) return;
    setSaving(true);
    try {
      await saveTrainingPlan(
        {
          vdot: result.vdot,
          thresholdPaceSec: result.threshold,
          subTDays,
          sourceDistanceM: result.sourceDistanceM,
          sourceTimeSec: result.sourceTimeSec,
        },
        user,
      );
      await mutatePlan();
      toast.success("플랜을 저장했어요");
    } catch {
      toast.error("저장에 실패했어요");
    } finally {
      setSaving(false);
    }
  }

  // 저장된 플랜과 현재 결과가 같은지(저장 버튼 노출 판단).
  const sortedKey = (a: number[]) => [...a].sort((x, y) => x - y).join(",");
  const isSaved =
    savedPlan != null &&
    result != null &&
    savedPlan.thresholdPaceSec === result.threshold &&
    sortedKey(savedPlan.subTDays) === sortedKey(subTDays);

  // "오늘의 세션"은 저장된 활성 플랜에서만 — 계산만 한 미저장 플랜은 미노출.
  const todaySession = savedPlan
    ? weeklyPlan(savedPlan.thresholdPaceSec, savedPlan.subTDays)[todayIndex()]
    : null;

  return (
    <PageLayout title="NSM 코치">
      {/* 오늘의 세션 — 플랜 있을 때 최상단 */}
      {todaySession ? (
        <Card className="border-zinc-900 bg-zinc-900 text-white">
          <div className="text-xs text-zinc-400">오늘 ({DAYS[todayIndex()]}) 세션</div>
          {(() => {
            const { title, sub } = sessionLabel(todaySession);
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
            세션 시작
          </button>
          {!todaySession.isSubT ? (
            <p className="mt-2 text-[11px] text-zinc-400">오늘은 이지런 — 페이스 신경 쓰지 말고 편하게.</p>
          ) : null}
        </Card>
      ) : (
        <Card>
          <p className="text-xs leading-relaxed text-zinc-500">
            최근 전력 기록을 넣으면 역치 페이스를 계산하고, 일주일 NSM 스케줄을 만들어줘요.
          </p>
        </Card>
      )}

      {/* PB 자동 추천 */}
      {pbs && pbs.length > 0 ? (
        <Card className="mt-4">
          <div className="text-sm font-semibold text-zinc-900">내 기록에서 선택</div>
          <p className="mt-0.5 text-[11px] text-zinc-500">탭하면 바로 계산돼요.</p>
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

      {/* 직접 입력 */}
      <Card className="mt-4">
        <div className="text-sm font-semibold text-zinc-900">또는 직접 입력</div>
        <div className="mt-3 flex flex-col gap-3">
          <label className="block">
            <span className="text-xs font-medium text-zinc-600">레이스 거리</span>
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
          <label className="block">
            <span className="text-xs font-medium text-zinc-600">기록 (mm:ss)</span>
            <input
              type="text"
              inputMode="numeric"
              value={timeStr}
              onChange={(e) => setTimeStr(e.target.value)}
              placeholder="22:00"
              className="mt-1 w-32 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
            />
          </label>
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
          <button
            type="button"
            onClick={onCalc}
            className="rounded-lg bg-zinc-900 py-2.5 text-sm text-white hover:bg-zinc-800"
          >
            계산하기
          </button>
        </div>
      </Card>

      {/* sub-T 요일 선택 */}
      <Card className="mt-4">
        <div className="text-xs font-medium text-zinc-600">sub-T 요일 (2~3개)</div>
        <div className="mt-2 flex gap-1.5">
          {DAYS.map((label, d) => {
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
        <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
          빡센 날을 직접 골라요. 하루씩 띄우는 걸 추천(예: 화·목·토). 나머지는 이지런으로 자동 채워져요.
        </p>
      </Card>

      {result ? (
        <>
          <Card className="mt-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-zinc-500">내 역치 페이스</div>
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
                onClick={() => redirectToLogin("/training")}
                className="mt-3 w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-semibold text-white"
              >
                가입하고 코칭 받기
              </button>
            ) : isSaved ? (
              <div className="mt-3 rounded-lg bg-zinc-100 py-2 text-center text-xs font-medium text-zinc-500">
                내 플랜으로 저장됨 ✓
              </div>
            ) : (
              <button
                type="button"
                onClick={onSave}
                disabled={saving}
                className="mt-3 w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? "저장 중..." : "이 플랜으로 시작"}
              </button>
            )}
          </Card>

          <Card className="mt-4">
            <div className="text-base font-semibold">이번 주 스케줄</div>
            <div className="mt-3 flex flex-col gap-2">
              {result.plan.map((s) => {
                const { title, sub, tag } = sessionLabel(s);
                const isToday = s.day === todayIndex();
                return (
                  <div
                    key={s.day}
                    className={`flex items-start gap-3 rounded-xl border p-3 ${
                      isToday ? "border-zinc-900 bg-zinc-50" : s.isSubT ? "border-zinc-200" : "border-zinc-100"
                    }`}
                  >
                    <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-600">
                      {DAYS[s.day]}
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
                        {isToday ? (
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">오늘</span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 text-[11px] text-zinc-500">{sub}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-zinc-400">
              sub-T 세션만 페이스를 빡세게 맞추고, 이지런은 그냥 느리게. 빡센 건 주 {subTDays.length}번, 나머지는 자주 뛰되 편하게.
            </p>
          </Card>
        </>
      ) : null}
    </PageLayout>
  );
}

export default function TrainingPage() {
  // 비로그인도 계산까지 가능 — 저장/오늘의세션만 로그인 필요.
  const { user, loading } = useAuthUser();

  if (loading) {
    return (
      <PageLayout title="NSM 코치">
        <LoadingCard />
      </PageLayout>
    );
  }

  return <TrainingContent user={user ?? null} />;
}
