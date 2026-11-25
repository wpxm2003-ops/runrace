"use client";

import type { WeeklyGoalStatus } from "@/lib/api/types";
import { track } from "@/lib/analytics";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import {
  formatWeeklyGoal,
  formatWeeklyGoalProgress,
  formatWeeklyGoalRemaining,
  suggestionInUnit,
  weeklyGoalProgress,
} from "@/lib/weeklyGoal";

function GoalIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.8" fill="currentColor" />
    </svg>
  );
}

function StreakChip({ days, label }: { days: number; label: string }) {
  if (days <= 0) return null; // 끊긴 연속(0일)은 보여주지 않는다 — 패배감 프레이밍 방지
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-pill bg-brand-soft px-2 py-0.5 text-[11px] font-bold text-brand">
      <span aria-hidden="true">🔥</span>
      {label}
    </span>
  );
}

/**
 * 홈 맨 위 개인 주간 목표 카드. 목표 없음 → "이번 주 목표 정하기"(최근 4주 추천값),
 * 진행 중 → 진척 바 + 남은 양, 달성 → 달성 문구. 세 상태 모두 현재 연속 기록을 함께 보이고,
 * 탭하면 설정·수정 시트를 연다.
 */
export function WeeklyGoalCard({
  status,
  loading,
  onOpen,
}: {
  status: WeeklyGoalStatus | undefined;
  loading: boolean;
  onOpen: () => void;
}) {
  const { t } = useLocale();
  const { unit } = useUnit();

  if (!status) {
    return loading ? (
      <div className="h-[5.5rem] animate-pulse rounded-card border border-line bg-panel shadow-card" aria-label={t.loading} />
    ) : null; // 조회 실패 시 홈의 나머지를 가리지 않도록 카드만 숨긴다
  }

  const state = weeklyGoalProgress(status);
  const handleTap = () => {
    void track("weekly_goal_card_tap", { state: state.kind });
    onOpen();
  };

  if (state.kind === "none") {
    // 시트가 제안하는 값과 같도록 사용자 단위 정수로 맞춘다(5km 추천을 mi로 보면 시트와 같은 4 mi).
    const goal = formatWeeklyGoal(suggestionInUnit(state.suggestion, unit), unit, t);
    return (
      <button
        type="button"
        onClick={handleTap}
        data-testid="weekly-goal-card"
        data-state="none"
        className="flex w-full items-center gap-3 rounded-card border border-line bg-panel p-4 text-left shadow-card transition-[border-color,transform] hover:border-brand/35 active:scale-[0.99]"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
          <GoalIcon />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-ink">{t.weekly_goal_set_title}</span>
          <span className="mt-0.5 block text-xs leading-snug text-muted">
            {state.fromHistory ? t.weekly_goal_suggest_history(goal) : t.weekly_goal_suggest_new(goal)}
          </span>
          {state.streakDays > 0 ? (
            <span className="mt-1.5 block">
              <StreakChip days={state.streakDays} label={t.weekly_goal_streak(state.streakDays)} />
            </span>
          ) : null}
        </span>
        <span className="shrink-0 rounded-control bg-brand px-3 py-2 text-xs font-bold text-night">
          {t.weekly_goal_set_cta}
        </span>
      </button>
    );
  }

  const achieved = state.kind === "achieved";
  const progress = formatWeeklyGoalProgress(state.goal, state.current, unit, t);
  return (
    <button
      type="button"
      onClick={handleTap}
      aria-label={`${t.weekly_goal_edit_label}: ${progress.current} / ${progress.target}`}
      data-testid="weekly-goal-card"
      data-state={state.kind}
      className="block w-full rounded-card border border-line bg-panel p-4 text-left shadow-card transition-[border-color,transform] hover:border-brand/35 active:scale-[0.99]"
    >
      <span className="flex items-center justify-between gap-3">
        <span className={`text-xs font-semibold ${achieved ? "text-emerald-600" : "text-muted"}`}>
          {achieved ? t.weekly_goal_achieved_label : t.weekly_goal_label}
        </span>
        <StreakChip days={state.streakDays} label={t.weekly_goal_streak(state.streakDays)} />
      </span>
      <span className="mt-2 flex items-end justify-between gap-3">
        <span className="rr-number whitespace-nowrap text-2xl font-black leading-none tracking-[-0.04em] text-ink">
          {progress.current}
          <span className="ml-1 text-sm font-bold tracking-normal text-muted">/ {progress.target}</span>
        </span>
        <span className="min-w-0 truncate text-right text-xs font-semibold text-muted">
          {achieved
            ? t.weekly_goal_achieved_desc
            : t.weekly_goal_remaining(formatWeeklyGoalRemaining(state.goal.type, state.remaining, unit, t))}
        </span>
      </span>
      {/* 버튼 안이라 ui/ProgressBar(div) 대신 같은 모양의 span으로 그린다(버튼 내용은 phrasing content). */}
      <span
        role="progressbar"
        aria-label={t.weekly_goal_progress_label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(state.percent)}
        className="mt-3 block h-1.5 w-full overflow-hidden rounded-pill bg-zinc-100"
      >
        <span
          className={`block h-full rounded-pill transition-[width] duration-500 ${achieved ? "bg-emerald-500" : "bg-brand"}`}
          style={{ width: `${state.percent}%` }}
        />
      </span>
    </button>
  );
}
