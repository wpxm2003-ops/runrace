package com.runrace.backend.goal.service;

import com.runrace.backend.goal.domain.WeekWindow;
import com.runrace.backend.goal.dto.WeeklyGoalResponse.Suggestion;
import com.runrace.backend.goal.repository.WeeklyGoalRepository.WeekTotals;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 최근 4주(이번 주 제외) 기록으로 주간 목표 추천값을 만든다.
 *
 * <p>습관 고리가 목적이라 "지켜낼 수 있는 목표"를 고른다: 주 평균을 그대로 쓰고, 거리는 km 단위로
 * 올림, 횟수는 반올림한다. 앞쪽의 기록 없는 주(가입 전·긴 공백 뒤 복귀)는 평균에서 뺀다 —
 * 가입 2주 차 사용자의 평균을 0km 주 두 개가 반토막 내지 않도록.
 */
final class WeeklyGoalSuggester {
  static final int LOOKBACK_WEEKS = 4;
  static final int DEFAULT_DISTANCE_M = 5_000;
  static final int DEFAULT_RUNS = 2;
  private static final int MIN_DISTANCE_M = 2_000;
  private static final int MAX_DISTANCE_M = 300_000;
  private static final int MIN_RUNS = 1;
  private static final int MAX_RUNS = 14;

  private WeeklyGoalSuggester() {}

  static Suggestion suggest(List<WeekTotals> rows, WeekWindow thisWeek) {
    Map<LocalDate, WeekTotals> byWeek = new HashMap<>();
    for (WeekTotals row : rows) byWeek.put(row.getWeekStart(), row);

    long distanceSum = 0;
    long runsSum = 0;
    int weeks = 0;
    for (int i = LOOKBACK_WEEKS; i >= 1; i--) {
      WeekTotals row = byWeek.get(thisWeek.minusWeeks(i).start());
      long runs = row == null ? 0 : row.getRuns();
      if (weeks == 0 && runs == 0) continue; // 앞쪽 빈 주는 건너뛴다
      distanceSum += row == null ? 0 : row.getDistanceM();
      runsSum += runs;
      weeks++;
    }
    if (weeks == 0) return new Suggestion(DEFAULT_DISTANCE_M, DEFAULT_RUNS, false);

    double avgDistanceM = (double) distanceSum / weeks;
    double avgRuns = (double) runsSum / weeks;
    int distanceM = (int) Math.ceil(avgDistanceM / 1000.0) * 1000;
    int runs = (int) Math.round(avgRuns);
    return new Suggestion(
        clamp(distanceM, MIN_DISTANCE_M, MAX_DISTANCE_M),
        clamp(runs, MIN_RUNS, MAX_RUNS),
        true);
  }

  private static int clamp(int value, int min, int max) {
    return Math.max(min, Math.min(max, value));
  }
}
