package com.runrace.backend.activity.service;

import com.runrace.backend.activity.domain.UserTimeZones;
import com.runrace.backend.activity.dto.RetentionMetricsResponse;
import com.runrace.backend.activity.dto.RetentionMetricsResponse.ActiveUsers;
import com.runrace.backend.activity.repository.RetentionMetricsRepository;
import com.runrace.backend.activity.repository.RetentionMetricsRepository.Basis;
import com.runrace.backend.activity.repository.RetentionMetricsRepository.SignupRow;
import com.runrace.backend.activity.repository.RetentionMetricsRepository.UserDay;
import com.runrace.backend.activity.service.CohortRetentionCalculator.Signup;
import com.runrace.backend.common.KstTime;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.temporal.TemporalAdjusters;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * 관리자 재방문 지표 계산. 정의는 {@link RetentionMetricsResponse}와
 * {@link CohortRetentionCalculator}에 적어 두었고, 관리자 화면(/sb)도 같은 정의를 보여 준다.
 */
@Service
@RequiredArgsConstructor
public class RetentionMetricsService {
  /** "오늘"을 정하는 기준 시간대. 사용자 활동 날짜 자체는 각자의 현지 날짜다. */
  static final ZoneId REFERENCE_ZONE = KstTime.ZONE;
  static final int COHORT_WEEKS = 8;
  /**
   * 가장 앞선 시간대(UTC+14). 현지 날짜 d에 가입한 사용자는 이 오프셋의 d 00:00 이후에 가입했으므로
   * 가입자 조회 하한으로 쓰면 어떤 시간대의 가입자도 빠지지 않는다(넘치는 쪽은 현지 날짜로 거른다).
   */
  private static final ZoneOffset EARLIEST_OFFSET = ZoneOffset.ofHours(14);

  private final RetentionMetricsRepository repository;

  public RetentionMetricsResponse compute(List<String> excludedNames) {
    return compute(excludedNames, Instant.now());
  }

  /** 테스트에서 시각을 고정해 부른다. */
  RetentionMetricsResponse compute(List<String> excludedNames, Instant now) {
    LocalDate today = now.atZone(REFERENCE_ZONE).toLocalDate();

    // 수집 첫날은 배포 시각 이전 방문이 빠진 부분 수집이라 완결된 날로 치지 않는다. 첫 핑 시각의
    // 가장 앞선 시간대(UTC+14) 날짜 다음 날부터 판정하면, 어느 시간대 사용자의 현지 날짜든 그 날은
    // 첫 핑 이후에 시작한 날이라 수집 전 시간이 섞이지 않는다. 화면에 보이는 수집 시작일은 KST 날짜.
    OffsetDateTime firstVisitAt = repository.firstVisitAt().orElse(null);
    LocalDate visitCollectionStart = firstVisitAt == null
        ? null
        : firstVisitAt.atZoneSameInstant(REFERENCE_ZONE).toLocalDate();
    LocalDate visitCompleteFrom = firstVisitAt == null
        ? null
        : firstVisitAt.withOffsetSameInstant(EARLIEST_OFFSET).toLocalDate().plusDays(1);

    ActiveUsers visits = activeUsers(Basis.VISITS, today, visitCompleteFrom, excludedNames);
    ActiveUsers runs = activeUsers(Basis.RUNS, today, LocalDate.MIN, excludedNames);

    LocalDate newestWeekStart = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
    LocalDate oldestWeekStart = newestWeekStart.minusWeeks(COHORT_WEEKS - 1);
    OffsetDateTime createdFrom = oldestWeekStart.atStartOfDay().atOffset(EARLIEST_OFFSET);

    List<Signup> signups = repository.signupsSince(createdFrom, excludedNames).stream()
        .map(row -> toSignup(row, now))
        .filter(s -> !s.signupDate().isBefore(oldestWeekStart))
        .toList();
    LocalDate signupWindowStart = today.minusDays(6);
    long newSignups7d = signups.stream()
        .filter(s -> !s.signupDate().isBefore(signupWindowStart) && !s.signupDate().isAfter(today))
        .count();

    // 판정 대상 날짜는 "사용자 현지 오늘"보다 앞선 날이라 KST 오늘까지만 읽으면 충분하다.
    Map<UUID, Set<LocalDate>> visitDays = byUser(repository.activeDaysOfSignups(
        Basis.VISITS, createdFrom, oldestWeekStart, today, excludedNames));
    Map<UUID, Set<LocalDate>> runDays = byUser(repository.activeDaysOfSignups(
        Basis.RUNS, createdFrom, oldestWeekStart, today, excludedNames));

    return new RetentionMetricsResponse(
        today.toString(),
        REFERENCE_ZONE.getId(),
        visitCollectionStart == null ? null : visitCollectionStart.toString(),
        newSignups7d,
        visits,
        runs,
        CohortRetentionCalculator.compute(
            newestWeekStart, COHORT_WEEKS, signups, visitDays, runDays, visitCompleteFrom));
  }

  /**
   * @param completeFrom 평균에 넣을 수 있는 첫 날(그 이전은 수집 전). null이면 판정할 날이 없다.
   */
  private ActiveUsers activeUsers(
      Basis basis, LocalDate today, LocalDate completeFrom, List<String> excludedNames) {
    long dau = repository.distinctActiveUsers(basis, today, today, excludedNames);

    // 오늘은 진행 중이라 평균에서 빼고, 어제까지 최근 7일로 낸다.
    LocalDate avgFrom = today.minusDays(7);
    LocalDate avgTo = today.minusDays(1);
    Map<LocalDate, Long> daily = repository.dailyActiveUsers(basis, avgFrom, avgTo, excludedNames);
    int days = 0;
    long sum = 0;
    if (completeFrom != null) {
      for (LocalDate d = avgFrom; !d.isAfter(avgTo); d = d.plusDays(1)) {
        if (d.isBefore(completeFrom)) continue;
        days++;
        sum += daily.getOrDefault(d, 0L);
      }
    }
    Double avgDau7d = days == 0 ? null : (double) sum / days;

    long wau = repository.distinctActiveUsers(basis, today.minusDays(6), today, excludedNames);
    long mau = repository.distinctActiveUsers(basis, today.minusDays(29), today, excludedNames);
    return new ActiveUsers(dau, avgDau7d, days, wau, mau);
  }

  private static Signup toSignup(SignupRow row, Instant now) {
    ZoneId zone = UserTimeZones.resolve(row.timeZone());
    return new Signup(
        row.userId(),
        row.createdAt().atZoneSameInstant(zone).toLocalDate(),
        now.atZone(zone).toLocalDate());
  }

  private static Map<UUID, Set<LocalDate>> byUser(List<UserDay> rows) {
    Map<UUID, Set<LocalDate>> result = new HashMap<>();
    for (UserDay row : rows) {
      result.computeIfAbsent(row.userId(), id -> new HashSet<>()).add(row.day());
    }
    return result;
  }
}
