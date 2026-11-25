// ── 개인 주간 목표(weekly goal) ──────────────────────────────────
export type WeeklyGoalType = "DISTANCE" | "RUNS";

/** 설정한 주간 목표. target은 DISTANCE면 미터, RUNS면 횟수. */
export type WeeklyGoal = {
  type: WeeklyGoalType;
  target: number;
};

/** GET/PUT /api/weekly-goal — 목표 + 이번 주 진척 + 현재 연속 기록 + 추천값. */
export type WeeklyGoalStatus = {
  goal: WeeklyGoal | null;
  /** 이번 주 월요일(yyyy-MM-dd, 사용자 시간대 기준). */
  weekStart: string;
  distanceM: number;
  runs: number;
  /** 오늘 또는 어제까지 이어진 연속 운동일. 끊겼으면 0. */
  currentStreakDays: number;
  /** 최근 4주 기록 기반 추천값. fromHistory=false면 기록이 없어 입문 기본값. */
  suggestion: { distanceM: number; runs: number; fromHistory: boolean };
};

export type WeeklyGoalSaveBody = WeeklyGoal;
