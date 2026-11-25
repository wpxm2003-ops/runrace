package com.runrace.backend.activity.service;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.runrace.backend.activity.dto.RetentionMetricsResponse.Cell;
import com.runrace.backend.activity.dto.RetentionMetricsResponse.Cohort;
import com.runrace.backend.activity.service.CohortRetentionCalculator.Signup;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class CohortRetentionCalculatorTest {

  private static final LocalDate MON = LocalDate.parse("2026-11-02"); // 월요일
  private static final LocalDate FAR_FUTURE = LocalDate.parse("2027-12-31");
  private final UUID a = UUID.randomUUID();
  private final UUID b = UUID.randomUUID();

  private static Signup signup(UUID id, LocalDate signupDate, LocalDate userToday) {
    return new Signup(id, signupDate, userToday);
  }

  /** D-n은 "정확히 n일째"다 — 그 전후 날짜의 활동은 세지 않는다. */
  @Test
  void countsOnlyActivityOnExactlyTheNthDay() {
    List<Signup> members = List.of(signup(a, MON, FAR_FUTURE));

    Cell exact = CohortRetentionCalculator.cell(
        members, Map.of(a, Set.of(MON.plusDays(7))), LocalDate.MIN, 7);
    Cell dayBefore = CohortRetentionCalculator.cell(
        members, Map.of(a, Set.of(MON.plusDays(6))), LocalDate.MIN, 7);
    Cell dayAfter = CohortRetentionCalculator.cell(
        members, Map.of(a, Set.of(MON.plusDays(8))), LocalDate.MIN, 7);
    // 가입 당일(D0) 활동은 D1이 아니다.
    Cell signupDayOnly = CohortRetentionCalculator.cell(
        members, Map.of(a, Set.of(MON)), LocalDate.MIN, 1);

    assertEquals(new Cell(1, 1), exact);
    assertEquals(new Cell(1, 0), dayBefore);
    assertEquals(new Cell(1, 0), dayAfter);
    assertEquals(new Cell(1, 0), signupDayOnly);
  }

  /** 사용자 현지 기준 그 날이 아직 끝나지 않았으면(오늘) 분모에서 뺀다. 어제면 판정한다. */
  @Test
  void excludesUsersWhoseNthDayHasNotEnded() {
    LocalDate signupDate = MON;
    // D1 = 화요일. 사용자 현지 오늘이 화요일이면 아직 진행 중, 수요일이면 판정 가능.
    Cell inProgress = CohortRetentionCalculator.cell(
        List.of(signup(a, signupDate, signupDate.plusDays(1))),
        Map.of(a, Set.of(signupDate.plusDays(1))), LocalDate.MIN, 1);
    Cell ended = CohortRetentionCalculator.cell(
        List.of(signup(a, signupDate, signupDate.plusDays(2))),
        Map.of(a, Set.of(signupDate.plusDays(1))), LocalDate.MIN, 1);

    assertEquals(new Cell(0, 0), inProgress);
    assertEquals(new Cell(1, 1), ended);
  }

  /** 방문 기준은 수집이 완결된 첫 날 이전을 판정하지 않는다(그 날 자체는 판정). */
  @Test
  void excludesNthDaysBeforeCollectionWasComplete() {
    List<Signup> members = List.of(signup(a, MON, FAR_FUTURE));
    LocalDate d1 = MON.plusDays(1);

    assertEquals(new Cell(0, 0),
        CohortRetentionCalculator.cell(members, Map.of(a, Set.of(d1)), d1.plusDays(1), 1));
    assertEquals(new Cell(1, 1),
        CohortRetentionCalculator.cell(members, Map.of(a, Set.of(d1)), d1, 1));
    // 방문 기록이 하나도 없으면(null) 전부 판정 불가 — 0%로 보이면 안 된다.
    assertEquals(new Cell(0, 0),
        CohortRetentionCalculator.cell(members, Map.of(), null, 1));
  }

  /** 주는 월~일. 일요일 가입은 그 주, 다음 월요일 가입은 다음 주 코호트다. */
  @Test
  void assignsSignupsToMondayStartWeeks() {
    LocalDate sunday = MON.plusDays(6);
    LocalDate nextMonday = MON.plusDays(7);
    List<Signup> signups = List.of(
        signup(a, sunday, FAR_FUTURE),
        signup(b, nextMonday, FAR_FUTURE));

    List<Cohort> cohorts = CohortRetentionCalculator.compute(
        nextMonday, 2, signups, Map.of(), Map.of(), LocalDate.MIN);

    assertEquals(2, cohorts.size());
    assertEquals("2026-11-09", cohorts.get(0).weekStart());
    assertEquals("2026-11-15", cohorts.get(0).weekEnd());
    assertEquals(1, cohorts.get(0).size());
    assertEquals("2026-11-02", cohorts.get(1).weekStart());
    assertEquals("2026-11-08", cohorts.get(1).weekEnd());
    assertEquals(1, cohorts.get(1).size());
  }

  /** 방문·달리기 기준은 같은 코호트에서 따로 계산되고, 달리기 기준은 수집 시작일 제약이 없다. */
  @Test
  void computesBothBasesSideBySide() {
    LocalDate today = MON.plusDays(40);
    List<Signup> signups = List.of(signup(a, MON, today), signup(b, MON.plusDays(2), today));
    Map<UUID, Set<LocalDate>> visits = Map.of(a, Set.of(MON.plusDays(1), MON.plusDays(30)));
    Map<UUID, Set<LocalDate>> runs = Map.of(
        a, Set.of(MON.plusDays(7)),
        b, Set.of(MON.plusDays(3), MON.plusDays(9), MON.plusDays(32)));
    // 방문 수집은 MON+5일부터 완결 — D1(MON+1, MON+3)은 둘 다 판정 불가.
    LocalDate visitCompleteFrom = MON.plusDays(5);

    Cohort cohort = CohortRetentionCalculator.compute(
        MON, 1, signups, visits, runs, visitCompleteFrom).get(0);

    assertEquals(2, cohort.size());
    assertEquals(new Cell(0, 0), cohort.visits().d1());
    assertEquals(new Cell(2, 0), cohort.visits().d7());
    assertEquals(new Cell(2, 1), cohort.visits().d30());
    assertEquals(new Cell(2, 1), cohort.runs().d1());
    assertEquals(new Cell(2, 2), cohort.runs().d7());
    assertEquals(new Cell(2, 1), cohort.runs().d30());
  }

  @Test
  void emptyCohortHasZeroCells() {
    Cohort cohort = CohortRetentionCalculator.compute(
        MON, 1, List.of(), Map.of(), Map.of(), LocalDate.MIN).get(0);

    assertEquals(0, cohort.size());
    assertEquals(new Cell(0, 0), cohort.runs().d1());
    assertEquals(new Cell(0, 0), cohort.visits().d30());
  }
}
