package com.runrace.backend.goal.dto;

/**
 * 홈 주간 목표 카드 응답 — 목표, 이번 주 진척, 현재 연속 기록, 추천값.
 *
 * @param goal              설정한 목표. 없으면 null
 * @param weekStart         이번 주 월요일(yyyy-MM-dd, 사용자 시간대 기준)
 * @param distanceM         이번 주 누적 거리(m)
 * @param runs              이번 주 러닝 횟수
 * @param currentStreakDays 오늘 또는 어제까지 이어진 연속 운동일. 끊겼으면 0
 * @param suggestion        최근 4주 기록으로 만든 추천 목표(기록이 없으면 입문 기본값)
 */
public record WeeklyGoalResponse(
    Goal goal,
    String weekStart,
    long distanceM,
    long runs,
    int currentStreakDays,
    Suggestion suggestion) {

  /** @param target DISTANCE면 미터, RUNS면 횟수 */
  public record Goal(String type, int target) {}

  /** @param fromHistory 최근 4주 기록에서 나온 값이면 true, 기록이 없어 기본값이면 false */
  public record Suggestion(int distanceM, int runs, boolean fromHistory) {}
}
