import type {
  Achievement,
  WeeklyGoal,
  WeeklyGoalStatus,
  WeeklyGoalType,
} from "@/lib/api/types";
import { track } from "@/lib/analytics";
import type { Translations } from "@/lib/i18n/translations";
import type { DistanceUnit } from "@/lib/units";

/** 서버 AchievementService가 주간 목표를 처음 채운 저장에 붙이는 성과 코드. */
export const WEEKLY_GOAL_ACHIEVEMENT_CODE = "WEEKLY_GOAL_REACHED";

const METERS_PER_UNIT: Record<DistanceUnit, number> = { km: 1000, mi: 1609.344 };

/** 서버 검증(WeeklyGoalType)과 같은 저장 가능 범위. 거리는 미터. */
const DISTANCE_MIN_M = 1_000;
const DISTANCE_MAX_M = 300_000;
const RUNS_MIN = 1;
const RUNS_MAX = 14;

export type WeeklyGoalCardState =
  | {
      kind: "none";
      /** 목표 정하기 카드에 띄울 추천 목표. */
      suggestion: WeeklyGoal;
      /** 최근 4주 기록 기반이면 true, 기록이 없어 입문 기본값이면 false. */
      fromHistory: boolean;
      streakDays: number;
    }
  | {
      kind: "in_progress" | "achieved";
      goal: WeeklyGoal;
      /** 이번 주 누적(거리면 미터, 횟수면 회). */
      current: number;
      /** 0~100으로 자른 진척률. */
      percent: number;
      /** 남은 양(거리면 미터, 횟수면 회). 달성했으면 0. */
      remaining: number;
      streakDays: number;
    };

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(value, 0) : 0;
}

/** 기록이 있으면 거리, 없으면(입문) 이해하기 쉬운 횟수 목표를 먼저 권한다. */
export function defaultGoalType(status: Pick<WeeklyGoalStatus, "suggestion">): WeeklyGoalType {
  return status.suggestion.fromHistory ? "DISTANCE" : "RUNS";
}

export function suggestedTarget(
  status: Pick<WeeklyGoalStatus, "suggestion">,
  type: WeeklyGoalType,
): number {
  return type === "DISTANCE" ? status.suggestion.distanceM : status.suggestion.runs;
}

/** 이번 주 진척 — 홈 카드의 세 상태(목표 없음·진행 중·달성)를 가른다. */
export function weeklyGoalProgress(status: WeeklyGoalStatus): WeeklyGoalCardState {
  const streakDays = Math.floor(nonNegative(status.currentStreakDays));
  const goal = status.goal;
  if (!goal || !Number.isFinite(goal.target) || goal.target <= 0) {
    const type = defaultGoalType(status);
    return {
      kind: "none",
      suggestion: { type, target: suggestedTarget(status, type) },
      fromHistory: status.suggestion.fromHistory,
      streakDays,
    };
  }
  const current = nonNegative(goal.type === "DISTANCE" ? status.distanceM : status.runs);
  const remaining = Math.max(goal.target - current, 0);
  return {
    kind: remaining === 0 ? "achieved" : "in_progress",
    goal,
    current,
    percent: Math.min((current / goal.target) * 100, 100),
    remaining,
    streakDays,
  };
}

// ── 단위 변환(설정 시트·카드 표시) ─────────────────────────────────

/** 시트에서 고르는 값의 범위. 거리는 사용자 단위 정수(km 또는 mi), 횟수는 회. */
export function goalInputBounds(type: WeeklyGoalType, unit: DistanceUnit): { min: number; max: number } {
  if (type === "RUNS") return { min: RUNS_MIN, max: RUNS_MAX };
  const per = METERS_PER_UNIT[unit];
  return { min: Math.ceil(DISTANCE_MIN_M / per), max: Math.floor(DISTANCE_MAX_M / per) };
}

export function clampGoalInput(type: WeeklyGoalType, value: number, unit: DistanceUnit): number {
  const { min, max } = goalInputBounds(type, unit);
  const whole = Number.isFinite(value) ? Math.round(value) : min;
  return Math.min(Math.max(whole, min), max);
}

/**
 * 저장값 → 시트 입력값(사용자 단위 정수). 추천값은 올림("up", 추천 6km를 mi로 바꾸면 4mi),
 * 이미 저장된 목표는 가장 가까운 값("nearest", 5km → 3mi)으로 보여 준다.
 */
export function goalInputFromTarget(
  type: WeeklyGoalType,
  target: number,
  unit: DistanceUnit,
  rounding: "up" | "nearest" = "up",
): number {
  if (type === "RUNS") return clampGoalInput(type, target, unit);
  // 부동소수 오차로 15.000001mi가 16으로 올라가지 않도록 소수 셋째 자리에서 정리한 뒤 반올림한다.
  const units = Math.round((target / METERS_PER_UNIT[unit]) * 1000) / 1000;
  return clampGoalInput(type, rounding === "up" ? Math.ceil(units) : Math.round(units), unit);
}

/** 추천 목표를 시트가 제안하는 것과 같은 사용자 단위 정수로 맞춘다(카드·시트 표기 일치). */
export function suggestionInUnit(goal: WeeklyGoal, unit: DistanceUnit): WeeklyGoal {
  return {
    type: goal.type,
    target: goalTargetFromInput(goal.type, goalInputFromTarget(goal.type, goal.target, unit), unit),
  };
}

/**
 * 시트 입력값 → 저장할 목표값. 기존 목표를 같은 종류로 열어 값을 건드리지 않았으면 원래 값을 그대로 둔다 —
 * km로 정한 목표를 mi 화면에서 그냥 저장했을 때 반올림만큼 목표가 바뀌지 않게.
 */
export function goalTargetToSave(
  type: WeeklyGoalType,
  value: number,
  unit: DistanceUnit,
  existing: WeeklyGoal | null,
): number {
  if (existing && existing.type === type
      && clampGoalInput(type, value, unit) === goalInputFromTarget(type, existing.target, unit, "nearest")) {
    return existing.target;
  }
  return goalTargetFromInput(type, value, unit);
}

/** 시트 입력값 → 저장값(거리는 미터). */
export function goalTargetFromInput(type: WeeklyGoalType, value: number, unit: DistanceUnit): number {
  const input = clampGoalInput(type, value, unit);
  if (type === "RUNS") return input;
  return Math.min(Math.max(Math.round(input * METERS_PER_UNIT[unit]), DISTANCE_MIN_M), DISTANCE_MAX_M);
}

/** 미터 → 사용자 단위 숫자 문자열(소수 1자리, 끝자리 0 제거). 예: 15000 → "15", 8200 → "8.2". */
export function formatGoalDistanceAmount(meters: number, unit: DistanceUnit): string {
  return String(Number((nonNegative(meters) / METERS_PER_UNIT[unit]).toFixed(1)));
}

/** 진척 바의 현재값 — 소수 1자리 고정(8.2 / 15 km). 반올림으로 목표를 넘어 보이지 않게 내림한다. */
export function formatProgressDistance(meters: number, unit: DistanceUnit): string {
  const tenths = Math.floor((nonNegative(meters) / METERS_PER_UNIT[unit]) * 10 + 1e-9);
  return (tenths / 10).toFixed(1);
}

/** 남은 거리 — 0.1 단위 올림("이만큼 뛰면 채운다"가 거짓이 되지 않게). */
export function formatRemainingDistance(meters: number, unit: DistanceUnit): string {
  const tenths = Math.ceil((nonNegative(meters) / METERS_PER_UNIT[unit]) * 10 - 1e-9);
  return String(tenths / 10);
}

/** 목표 한 줄 표기 — "15 km" / "3회". */
export function formatWeeklyGoal(goal: WeeklyGoal, unit: DistanceUnit, t: Translations): string {
  return goal.type === "DISTANCE"
    ? `${formatGoalDistanceAmount(goal.target, unit)} ${unit}`
    : t.home_week_runs(goal.target);
}

/** 진척 표기 — 거리 "8.2" / "15 km", 횟수 "2" / "3회". */
export function formatWeeklyGoalProgress(
  goal: WeeklyGoal,
  current: number,
  unit: DistanceUnit,
  t: Translations,
): { current: string; target: string } {
  return goal.type === "DISTANCE"
    ? { current: formatProgressDistance(current, unit), target: formatWeeklyGoal(goal, unit, t) }
    : { current: String(Math.floor(current)), target: formatWeeklyGoal(goal, unit, t) };
}

/** 남은 양 표기 — "6.8 km" / "1회". */
export function formatWeeklyGoalRemaining(
  type: WeeklyGoalType,
  remaining: number,
  unit: DistanceUnit,
  t: Translations,
): string {
  return type === "DISTANCE"
    ? `${formatRemainingDistance(remaining, unit)} ${unit}`
    : t.home_week_runs(Math.ceil(remaining));
}

// ── 성과·분석 ─────────────────────────────────────────────────────

export function findWeeklyGoalAchievement(list: Achievement[] | undefined): Achievement | null {
  return list?.find((a) => a.code === WEEKLY_GOAL_ACHIEVEMENT_CODE) ?? null;
}

/** 운동 저장 응답에 주간 목표 달성이 있으면 weekly_goal_achieved를 보낸다(GPS·실내런 공용). */
export function trackWeeklyGoalAchieved(
  achievements: Achievement[] | undefined,
  source: "gps" | "indoor",
): void {
  const reached = findWeeklyGoalAchievement(achievements);
  if (!reached) return;
  void track("weekly_goal_achieved", {
    goal_type: reached.value2 === 1 ? "RUNS" : "DISTANCE",
    target: reached.value ?? 0,
    source,
  });
}
