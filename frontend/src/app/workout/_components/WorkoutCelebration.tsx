"use client";

import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import { formatDistance, formatPaceSecPerUnit } from "@/lib/units";
import { useEffect, useMemo, useRef, useState } from "react";
import { nativeNavigate } from "@/lib/nativeNav";
import { useNativeBack } from "@/lib/useNativeBack";
import { markNsmCtaShown } from "@/lib/nsmCta";
import { track } from "@/lib/analytics";
import type { Achievement, PersonalBest } from "@/lib/api/types";
import { achievementViews, type AchievementTone } from "@/lib/achievements";
import { celebrationTone } from "@/lib/celebration";
import type { GhostRaceResult } from "@/lib/ghostRace";

const CONFETTI_COLORS = ["#f59e0b", "#ef4444", "#3b82f6", "#10b981", "#8b5cf6", "#ec4899"] as const;
const AUTO_NAVIGATE_SEC = 15;

/**
 * 저장 직후 축하/결과 모달. 기록 요약(시간·거리·페이스)은 싣지 않는다 — 확인 버튼이나
 * 자동 이동으로 곧장 가는 상세 화면이 같은 값을 더 자세히 보여주므로 중복이었다.
 *
 * <p>호출부는 이 모달을 <b>보여줄 카드가 있을 때만</b> 렌더해야 한다({@link celebrationTone}).
 * 카드가 없으면 모달 대신 상세로 바로 이동시키는 것이 호출부 책임이다.
 */
type WorkoutCelebrationProps = {
  recordId: number;
  personalBest?: PersonalBest | null;
  /** 서버가 판정한 오늘의 성과(최대 3개). <b>내세울 게 없으면 빈 배열이 온다.</b> */
  achievements?: Achievement[];
  ghostResult?: GhostRaceResult | null;
  ghostLabel?: string | null;
  /** 고스트 패배 시 NSM 훈련 제안 — 게이트(접전·연패·7일 캡·플랜 없음)는 호출부에서 통과된 값. */
  showNsmCta?: boolean;
};

function pbDaysLabel(days: number, t: ReturnType<typeof useLocale>["t"]): string {
  if (days < 1) return "";
  if (days < 30) return t.pb_days_since(Math.round(days));
  if (days < 365) return t.pb_months_since(Math.round(days / 30));
  return t.pb_years_since(Math.round(days / 365));
}

export function WorkoutCelebration({
  recordId,
  personalBest = null,
  achievements = [],
  ghostResult = null,
  ghostLabel = null,
  showNsmCta = false,
}: WorkoutCelebrationProps) {
  const { t } = useLocale();
  const { unit } = useUnit();
  const [remaining, setRemaining] = useState(AUTO_NAVIGATE_SEC);
  const navigatedRef = useRef(false);

  const views = achievementViews(achievements, t, unit);
  // 고스트 패배·무승부는 결과와 훈련 제안만 담백하게 — confetti·🎉는 축하할 일에만.
  const { celebratory } = celebrationTone({
    achievementCount: views.length,
    personalBest,
    ghostResult,
    ghostLabel,
  });

  const message = useMemo(() => {
    const msgs = t.celebration_messages;
    // Math.random은 이 컴포넌트에서 서버가 아닌 클라이언트에서만 실행됨(mount 시 1회)
    return msgs[Math.floor(Math.random() * msgs.length)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goRecords = () => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    nativeNavigate(`/workouts/${recordId}`);
  };

  // 하드웨어 백버튼도 확인과 같게 — 기록은 이미 저장됐으므로 상세로 보낸다(빠져나가 버리지 않도록).
  useNativeBack(() => goRecords());

  const goTraining = () => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    void track("nsm_cta_click");
    nativeNavigate("/training");
  };

  // 실제로 화면에 뜬 순간에만 7일 캡을 소비한다(저장 실패로 모달이 안 뜨면 캡 유지).
  // 카드 렌더 조건과 같은 truthy 판정을 써야 한다 — 어긋나면 화면에 없는 CTA가
  // 7일 캡(markNsmCtaShown)과 노출 지표를 먹는다.
  const nsmCtaVisible = showNsmCta && ghostResult != null && !!ghostLabel;
  useEffect(() => {
    if (!nsmCtaVisible) return;
    markNsmCtaShown();
    void track("nsm_cta_shown");
  }, [nsmCtaVisible]);

  useEffect(() => {
    setRemaining(AUTO_NAVIGATE_SEC);
    navigatedRef.current = false;
    const interval = window.setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          goRecords();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
    // 마운트 1회만 — goRecords는 navigatedRef로 중복 이동을 막는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const particles = useMemo(
    () =>
      Array.from({ length: 48 }, (_, i) => ({
        id: i,
        left: `${(i * 17) % 100}%`,
        delay: `${(i % 8) * 0.08}s`,
        duration: `${1.8 + (i % 5) * 0.25}s`,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rotate: `${(i * 47) % 360}deg`,
      })),
    [],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      {celebratory ? (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {particles.map((p) => (
            <span
              key={p.id}
              className="confetti-piece absolute top-0 block h-3 w-2 rounded-sm opacity-90"
              style={{ left: p.left, backgroundColor: p.color, animationDelay: p.delay, animationDuration: p.duration, transform: `rotate(${p.rotate})` }}
            />
          ))}
        </div>
      ) : null}

      <div
        role="dialog"
        aria-modal="true"
        // 축하가 아닐 땐 제목 요소가 없으므로(고스트 결과만 남음) 카드 제목을 이름으로 준다.
        aria-label={celebratory || !ghostLabel ? t.celebration_title : t.ghost_result_title(ghostLabel)}
        className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl"
      >
        {celebratory ? (
          <>
            <div className="text-4xl">🎉</div>
            <h2 className="mt-3 text-xl font-semibold text-zinc-900">{t.celebration_title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">{message}</p>
          </>
        ) : null}

        {personalBest && (() => {
          const distLabels: Record<string, string> = { "3k": t.pb_3k, "5k": t.pb_5k, "10k": t.pb_10k, half: t.pb_half, marathon: t.pb_marathon };
          const distLabel = distLabels[personalBest.distanceKey] ?? personalBest.distanceKey;
          const faster = personalBest.previousPaceSec - personalBest.newPaceSec;
          const daysLabel = pbDaysLabel(personalBest.daysSincePrevious, t);
          return (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left">
              <p className="text-sm font-semibold text-amber-800">
                🏅 {distLabel} {t.pb_new_record}
              </p>
              <div className="mt-1 flex items-center gap-2 text-sm">
                <span className="font-mono text-zinc-400 line-through">{formatPaceSecPerUnit(personalBest.previousPaceSec)}</span>
                <span className="text-zinc-400">→</span>
                <span className="font-mono font-semibold text-amber-700">{formatPaceSecPerUnit(personalBest.newPaceSec)}</span>
                <span className="text-xs text-amber-600">({t.pb_seconds_faster(faster)})</span>
              </div>
              {daysLabel ? (
                <p className="mt-0.5 text-xs text-amber-500">{daysLabel}</p>
              ) : null}
            </div>
          );
        })()}

        {(() => {
          if (views.length === 0) return null;
          const toneClass: Record<AchievementTone, string> = {
            gold: "border-amber-200 bg-amber-50 text-amber-800",
            crew: "border-sky-200 bg-sky-50 text-sky-800",
            plain: "border-zinc-200 bg-zinc-50 text-zinc-700",
          };
          return (
            <div className="mt-3">
              <div className="mb-1.5 text-left text-xs font-medium text-zinc-500">
                {t.ach_heading}
              </div>
              <div className="flex flex-col gap-1.5">
                {views.map((v, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left ${toneClass[v.tone]}`}
                  >
                    <span className="shrink-0 text-base">{v.icon}</span>
                    <span className="text-sm font-medium">{v.text}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {ghostResult && ghostLabel && (() => {
          const deltaSec = Math.round(Math.abs(ghostResult.deltaMs) / 1000);
          const faster = ghostResult.deltaMs < 0;
          const tied = deltaSec === 0;
          const overlapLabel = formatDistance(ghostResult.overlapDistanceM, unit);
          return (
            <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-left">
              <p className="text-sm font-semibold text-violet-800">👻 {t.ghost_result_title(ghostLabel)}</p>
              <p className="mt-1 text-sm font-semibold text-violet-700">
                {tied
                  ? t.ghost_result_tied
                  : faster
                    ? t.ghost_result_faster(deltaSec)
                    : t.ghost_result_slower(deltaSec)}
              </p>
              <p className="mt-0.5 text-xs text-violet-500">{t.ghost_result_overlap(overlapLabel)}</p>
              {nsmCtaVisible && !faster && !tied ? (
                <button
                  type="button"
                  onClick={goTraining}
                  className="mt-2 w-full rounded-lg bg-violet-600 py-2 text-xs font-semibold text-white hover:bg-violet-700"
                >
                  {t.ghost_nsm_cta(deltaSec)}
                </button>
              ) : null}
            </div>
          );
        })()}

        <button type="button" onClick={goRecords}
          className="mt-5 h-12 w-full rounded-xl bg-zinc-900 text-sm font-medium text-white hover:bg-zinc-800">
          {t.celebration_confirm}
        </button>
        <p className="mt-2 text-xs text-zinc-400">{t.celebration_auto(remaining)}</p>
      </div>
    </div>
  );
}
