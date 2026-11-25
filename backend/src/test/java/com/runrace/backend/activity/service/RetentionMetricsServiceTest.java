package com.runrace.backend.activity.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.runrace.backend.activity.dto.RetentionMetricsResponse;
import com.runrace.backend.activity.repository.RetentionMetricsRepository;
import com.runrace.backend.activity.repository.RetentionMetricsRepository.Basis;
import com.runrace.backend.activity.repository.RetentionMetricsRepository.SignupRow;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class RetentionMetricsServiceTest {

  /** 2026-11-25(수) 12:00 KST. */
  private static final Instant NOW = Instant.parse("2026-11-25T03:00:00Z");
  private static final LocalDate TODAY = LocalDate.parse("2026-11-25");
  private static final List<String> EXCLUDED = List.of("운영자");

  @Mock RetentionMetricsRepository repository;
  @InjectMocks RetentionMetricsService service;

  @BeforeEach
  void defaults() {
    lenient().when(repository.distinctActiveUsers(any(), any(), any(), any())).thenReturn(0L);
    lenient().when(repository.dailyActiveUsers(any(), any(), any(), any())).thenReturn(Map.of());
    lenient().when(repository.signupsSince(any(), any())).thenReturn(List.of());
    lenient().when(repository.activeDaysOfSignups(any(), any(), any(), any(), any()))
        .thenReturn(List.of());
  }

  private static LocalDate d(String date) {
    return LocalDate.parse(date);
  }

  /**
   * 방문 기준 평균은 수집 첫날(부분 수집)을 빼고 어제까지만 낸다. 수집 3일째면 3일 평균이다.
   * 달리기 기준은 항상 7일 평균이다(활동 없는 날은 0으로 들어간다).
   */
  @Test
  void averagesOnlyFullyCollectedDaysBeforeToday() {
    // 첫 핑 11-21 10:00 KST → 11-21은 부분 수집, 11-22부터 판정
    when(repository.firstVisitAt()).thenReturn(Optional.of(OffsetDateTime.parse("2026-11-21T01:00:00Z")));
    when(repository.dailyActiveUsers(eq(Basis.VISITS), eq(d("2026-11-18")), eq(d("2026-11-24")), any()))
        .thenReturn(Map.of(d("2026-11-21"), 9L, d("2026-11-22"), 3L, d("2026-11-23"), 4L, d("2026-11-24"), 5L));
    when(repository.dailyActiveUsers(eq(Basis.RUNS), eq(d("2026-11-18")), eq(d("2026-11-24")), any()))
        .thenReturn(Map.of(d("2026-11-18"), 2L, d("2026-11-24"), 4L));
    when(repository.distinctActiveUsers(Basis.VISITS, TODAY, TODAY, EXCLUDED)).thenReturn(6L);
    when(repository.distinctActiveUsers(Basis.VISITS, d("2026-11-19"), TODAY, EXCLUDED)).thenReturn(11L);
    when(repository.distinctActiveUsers(Basis.VISITS, d("2026-10-27"), TODAY, EXCLUDED)).thenReturn(12L);

    RetentionMetricsResponse result = service.compute(EXCLUDED, NOW);

    assertEquals("2026-11-25", result.referenceDate());
    assertEquals("Asia/Seoul", result.referenceTimeZone());
    assertEquals("2026-11-21", result.visitCollectionStartDate());
    assertEquals(6, result.visits().dau());
    assertEquals(3, result.visits().avgDauDays());
    assertEquals(4.0, result.visits().avgDau7d(), 1e-9);
    assertEquals(11, result.visits().wau());
    assertEquals(12, result.visits().mau());
    assertEquals(7, result.runs().avgDauDays());
    assertEquals(6.0 / 7, result.runs().avgDau7d(), 1e-9);
  }

  /** 방문 기록이 아직 없으면 평균은 0이 아니라 "없음"(null)이고 수집 시작일도 비어 있다. */
  @Test
  void visitAverageIsEmptyBeforeAnyPing() {
    when(repository.firstVisitAt()).thenReturn(Optional.empty());

    RetentionMetricsResponse result = service.compute(EXCLUDED, NOW);

    assertNull(result.visitCollectionStartDate());
    assertNull(result.visits().avgDau7d());
    assertEquals(0, result.visits().avgDauDays());
    assertEquals(7, result.runs().avgDauDays());
  }

  /**
   * 첫 핑이 KST 저녁(19시 이후)이면 UTC+14에서는 이미 다음 날이라, 그 날까지 부분 수집으로 보고
   * 하루 더 늦게 판정을 시작한다(보수적). 화면의 수집 시작일은 KST 날짜 그대로다.
   */
  @Test
  void lateEveningFirstPingDelaysCompleteDaysByOne() {
    // 11-21 20:00 KST = 11-22 01:00 (UTC+14) → 11-23부터 판정
    when(repository.firstVisitAt()).thenReturn(Optional.of(OffsetDateTime.parse("2026-11-21T11:00:00Z")));

    RetentionMetricsResponse result = service.compute(EXCLUDED, NOW);

    assertEquals("2026-11-21", result.visitCollectionStartDate());
    assertEquals(2, result.visits().avgDauDays()); // 11-23, 11-24
  }

  /**
   * 최근 7일 신규 가입은 사용자 현지 가입일이 [오늘−6, 오늘]인 사람이다. 같은 UTC 순간이라도
   * 시간대에 따라 들어가고 빠진다.
   */
  @Test
  void countsNewSignupsByLocalSignupDate() {
    when(repository.firstVisitAt()).thenReturn(Optional.empty());
    when(repository.signupsSince(any(), eq(EXCLUDED))).thenReturn(List.of(
        // KST 11-25 01:00 → 오늘 가입
        signup("2026-11-24T16:00:00Z", "Asia/Seoul"),
        // KST 11-18 23:59 → 7일 전이라 제외
        signup("2026-11-18T14:59:00Z", "Asia/Seoul"),
        // KST 11-19 00:00 → 포함(경계)
        signup("2026-11-18T15:00:00Z", "Asia/Seoul"),
        // LA 11-18 23:00 → 제외
        signup("2026-11-19T07:00:00Z", "America/Los_Angeles"),
        // LA 11-19 00:00 → 포함
        signup("2026-11-19T08:00:00Z", "America/Los_Angeles")));

    RetentionMetricsResponse result = service.compute(EXCLUDED, NOW);

    assertEquals(3, result.newSignups7d());
  }

  /**
   * 코호트는 이번 주(월요일 시작)부터 과거로 8주. 가입자 조회 하한은 가장 오래된 주 월요일
   * 00:00(UTC+14)라서 어느 시간대의 가입자도 빠지지 않는다.
   */
  @Test
  void buildsEightMondayWeeksAndQueriesFromTheEarliestOffset() {
    when(repository.firstVisitAt()).thenReturn(Optional.empty());

    RetentionMetricsResponse result = service.compute(EXCLUDED, NOW);

    assertEquals(8, result.cohorts().size());
    assertEquals("2026-11-23", result.cohorts().get(0).weekStart());
    assertEquals("2026-11-29", result.cohorts().get(0).weekEnd());
    assertEquals("2026-10-05", result.cohorts().get(7).weekStart());
    verify(repository).signupsSince(OffsetDateTime.parse("2026-10-05T00:00:00+14:00"), EXCLUDED);
    verify(repository).activeDaysOfSignups(
        Basis.VISITS, OffsetDateTime.parse("2026-10-05T00:00:00+14:00"), d("2026-10-05"), TODAY, EXCLUDED);
    verify(repository).activeDaysOfSignups(
        Basis.RUNS, OffsetDateTime.parse("2026-10-05T00:00:00+14:00"), d("2026-10-05"), TODAY, EXCLUDED);
  }

  /** UTC+14 하한 때문에 넘쳐 들어온 "가장 오래된 주 이전" 가입자는 코호트에 넣지 않는다. */
  @Test
  void dropsSignupsBeforeTheOldestCohortWeek() {
    when(repository.firstVisitAt()).thenReturn(Optional.empty());
    when(repository.signupsSince(any(), any())).thenReturn(List.of(
        // KST 10-04(일) 23:30 → 가장 오래된 주(10-05~) 이전
        signup("2026-10-04T14:30:00Z", "Asia/Seoul"),
        // KST 10-05(월) 00:30 → 포함
        signup("2026-10-04T15:30:00Z", "Asia/Seoul")));

    RetentionMetricsResponse result = service.compute(EXCLUDED, NOW);

    assertEquals(1, result.cohorts().get(7).size());
  }

  private static SignupRow signup(String createdAt, String timeZone) {
    return new SignupRow(UUID.randomUUID(), OffsetDateTime.parse(createdAt), timeZone);
  }
}
