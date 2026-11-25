package com.runrace.backend.activity.service;

import com.runrace.backend.activity.dto.RetentionMetricsResponse.Cell;
import com.runrace.backend.activity.dto.RetentionMetricsResponse.Cohort;
import com.runrace.backend.activity.dto.RetentionMetricsResponse.CohortRates;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * 가입 주 코호트의 D1/D7/D30 재방문율 계산(DB 없이 순수 계산).
 *
 * <p><b>D-n 정의</b>: 가입일(사용자 현지 날짜)로부터 정확히 n일째 되는 현지 날짜에 활동했는가.
 * 그 사이 다른 날의 활동은 세지 않는다. 판정할 수 없는 가입자는 분모에서 뺀다.
 *
 * <ul>
 *   <li>그 날이 사용자 현지 기준으로 아직 끝나지 않았으면(오늘 이후) 판정하지 않는다.
 *   <li>방문 기준은 수집이 완결된 첫 날({@code completeFrom}) 이전 날짜를 판정하지 않는다.
 * </ul>
 */
final class CohortRetentionCalculator {
  private CohortRetentionCalculator() {}

  /** 코호트 판정 대상 가입자. 가입일·오늘 모두 그 사용자의 현지 날짜다. */
  record Signup(UUID userId, LocalDate signupDate, LocalDate userToday) {}

  /**
   * @param newestWeekStart 가장 최근 코호트 주의 월요일
   * @param weeks 코호트 주 수(최근 주부터 과거로)
   * @param visitCompleteFrom 방문 기준으로 판정할 수 있는 첫 날. 방문 기록이 없으면 null(전부 판정 불가)
   */
  static List<Cohort> compute(
      LocalDate newestWeekStart,
      int weeks,
      List<Signup> signups,
      Map<UUID, Set<LocalDate>> visitDays,
      Map<UUID, Set<LocalDate>> runDays,
      LocalDate visitCompleteFrom) {
    List<Cohort> cohorts = new ArrayList<>(weeks);
    for (int i = 0; i < weeks; i++) {
      LocalDate start = newestWeekStart.minusWeeks(i);
      LocalDate end = start.plusDays(6);
      List<Signup> members = signups.stream()
          .filter(s -> !s.signupDate().isBefore(start) && !s.signupDate().isAfter(end))
          .toList();
      cohorts.add(new Cohort(
          start.toString(),
          end.toString(),
          members.size(),
          rates(members, visitDays, visitCompleteFrom),
          rates(members, runDays, LocalDate.MIN)));
    }
    return cohorts;
  }

  private static CohortRates rates(
      List<Signup> members, Map<UUID, Set<LocalDate>> activeDays, LocalDate completeFrom) {
    return new CohortRates(
        cell(members, activeDays, completeFrom, 1),
        cell(members, activeDays, completeFrom, 7),
        cell(members, activeDays, completeFrom, 30));
  }

  static Cell cell(
      List<Signup> members, Map<UUID, Set<LocalDate>> activeDays, LocalDate completeFrom, int n) {
    int eligible = 0;
    int retained = 0;
    for (Signup s : members) {
      LocalDate target = s.signupDate().plusDays(n);
      if (!target.isBefore(s.userToday())) continue; // 현지 기준 아직 끝나지 않은 날
      if (completeFrom == null || target.isBefore(completeFrom)) continue; // 수집 전
      eligible++;
      if (activeDays.getOrDefault(s.userId(), Set.of()).contains(target)) retained++;
    }
    return new Cell(eligible, retained);
  }
}
