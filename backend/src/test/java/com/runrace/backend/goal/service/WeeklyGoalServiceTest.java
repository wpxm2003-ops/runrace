package com.runrace.backend.goal.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.runrace.backend.common.ApiException;
import com.runrace.backend.goal.domain.WeeklyGoal;
import com.runrace.backend.goal.domain.WeeklyGoalType;
import com.runrace.backend.goal.dto.WeeklyGoalRequest;
import com.runrace.backend.goal.dto.WeeklyGoalResponse;
import com.runrace.backend.goal.repository.WeeklyGoalRepository;
import com.runrace.backend.goal.repository.WeeklyGoalRepository.LatestStreak;
import com.runrace.backend.goal.repository.WeeklyGoalRepository.PeriodTotals;
import com.runrace.backend.goal.repository.WeeklyGoalRepository.WeekTotals;
import com.runrace.backend.workout.domain.WorkoutSession;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

class WeeklyGoalServiceTest {

  private final WeeklyGoalRepository repo = mock(WeeklyGoalRepository.class);
  private final WeeklyGoalService service = new WeeklyGoalService(repo);
  private final UUID userId = UUID.randomUUID();

  /** 2026-11-22(일) 15:30 UTC = 서울 11-23(월) 00:30 = LA 11-22(일) 07:30. */
  private static final Instant MONDAY_IN_SEOUL_SUNDAY_IN_LA = Instant.parse("2026-11-22T15:30:00Z");
  /** 2026-11-25(수) 03:00 UTC = 서울 수요일 정오. */
  private static final Instant WEDNESDAY = Instant.parse("2026-11-25T03:00:00Z");
  private static final LocalDate THIS_MONDAY = LocalDate.of(2026, 11, 23);
  private static final LocalDate LAST_MONDAY = LocalDate.of(2026, 11, 16);

  private static PeriodTotals totals(long distanceM, long runs) {
    return new PeriodTotals() {
      public long getDistanceM() { return distanceM; }
      public long getRuns() { return runs; }
    };
  }

  private static WeekTotals week(LocalDate start, long distanceM, long runs) {
    return new WeekTotals() {
      public LocalDate getWeekStart() { return start; }
      public long getDistanceM() { return distanceM; }
      public long getRuns() { return runs; }
    };
  }

  private static LatestStreak streak(LocalDate lastDate, int days) {
    return new LatestStreak() {
      public LocalDate getLastDate() { return lastDate; }
      public int getStreak() { return days; }
    };
  }

  private void stubZone(String zone) {
    when(repo.findUserTimeZone(userId)).thenReturn(Optional.ofNullable(zone));
  }

  private void stubGoal(WeeklyGoalType type, int target, LocalDate lastAchievedWeek) {
    when(repo.findById(userId)).thenReturn(Optional.of(WeeklyGoal.builder()
        .userId(userId)
        .goalType(type)
        .targetValue(target)
        .lastAchievedWeek(lastAchievedWeek)
        .build()));
  }

  private void stubWeekTotals(long distanceM, long runs) {
    when(repo.sumBetween(eq(userId), any(), any())).thenReturn(totals(distanceM, runs));
  }

  private static WorkoutSession runAtLocal(LocalDateTime startedAtLocal, int distanceM) {
    OffsetDateTime startedAt = OffsetDateTime.parse("2026-11-25T03:00:00Z");
    return WorkoutSession.builder()
        .id(1L)
        .distanceM(distanceM)
        .durationSec(1800)
        .startedAt(startedAt)
        .startedAtLocal(startedAtLocal)
        .endedAt(startedAt.plusMinutes(30))
        .build();
  }

  @BeforeEach void 기본_스텁() {
    when(repo.findById(userId)).thenReturn(Optional.empty());
    when(repo.sumBetween(eq(userId), any(), any())).thenReturn(totals(0, 0));
    when(repo.findLatestStreak(userId)).thenReturn(streak(null, 0));
    when(repo.sumByWeekBetween(eq(userId), any(), any())).thenReturn(List.of());
    stubZone("Asia/Seoul");
  }

  @Nested class 주_경계와_시간대 {

    @Test void 같은_순간이라도_서울은_새_주_LA는_지난_주다() {
      stubZone("Asia/Seoul");
      assertEquals("2026-11-23", service.status(userId, MONDAY_IN_SEOUL_SUNDAY_IN_LA).weekStart());
      verify(repo).sumBetween(userId, THIS_MONDAY.atStartOfDay(), THIS_MONDAY.plusDays(7).atStartOfDay());

      stubZone("America/Los_Angeles");
      assertEquals("2026-11-16", service.status(userId, MONDAY_IN_SEOUL_SUNDAY_IN_LA).weekStart());
      verify(repo).sumBetween(userId, LAST_MONDAY.atStartOfDay(), THIS_MONDAY.atStartOfDay());
    }

    @Test void 일요일_23시59분까지는_같은_주다() {
      // 서울 2026-11-29(일) 23:59 → 주 시작은 11-23
      Instant sundayNight = Instant.parse("2026-11-29T14:59:00Z");
      assertEquals("2026-11-23", service.status(userId, sundayNight).weekStart());
      // 1분 뒤(월 00:00)는 새 주
      assertEquals("2026-11-30", service.status(userId, sundayNight.plusSeconds(60)).weekStart());
    }

    @Test void 시간대가_없거나_잘못되면_KST로_본다() {
      stubZone("Not/AZone");
      assertEquals("2026-11-23", service.status(userId, MONDAY_IN_SEOUL_SUNDAY_IN_LA).weekStart());
      stubZone(null);
      assertEquals("2026-11-23", service.status(userId, MONDAY_IN_SEOUL_SUNDAY_IN_LA).weekStart());
    }

    @Test void 추천값은_이번_주_직전_4주를_본다() {
      service.status(userId, WEDNESDAY);
      verify(repo).sumByWeekBetween(
          userId, THIS_MONDAY.minusWeeks(4).atStartOfDay(), THIS_MONDAY.atStartOfDay());
    }
  }

  @Nested class 조회 {

    @Test void 목표가_없으면_goal은_null이고_진척과_추천은_내려준다() {
      stubWeekTotals(8_200, 2);
      WeeklyGoalResponse res = service.status(userId, WEDNESDAY);
      assertNull(res.goal());
      assertEquals(8_200, res.distanceM());
      assertEquals(2, res.runs());
      assertEquals(new WeeklyGoalResponse.Suggestion(5_000, 2, false), res.suggestion());
    }

    @Test void 목표가_있으면_종류와_목표값을_내려준다() {
      stubGoal(WeeklyGoalType.DISTANCE, 15_000, null);
      stubWeekTotals(8_200, 2);
      WeeklyGoalResponse res = service.status(userId, WEDNESDAY);
      assertEquals(new WeeklyGoalResponse.Goal("DISTANCE", 15_000), res.goal());
      assertEquals(8_200, res.distanceM());
    }

    @Test void 오늘이나_어제까지_이어진_연속만_현재_연속이다() {
      LocalDate today = LocalDate.of(2026, 11, 25);
      when(repo.findLatestStreak(userId)).thenReturn(streak(today, 4));
      assertEquals(4, service.status(userId, WEDNESDAY).currentStreakDays());

      when(repo.findLatestStreak(userId)).thenReturn(streak(today.minusDays(1), 3));
      assertEquals(3, service.status(userId, WEDNESDAY).currentStreakDays());

      when(repo.findLatestStreak(userId)).thenReturn(streak(today.minusDays(2), 9));
      assertEquals(0, service.status(userId, WEDNESDAY).currentStreakDays());
    }

    @Test void 연속일의_오늘은_사용자_시간대로_정한다() {
      // 서울 월 00:30 기준 어제는 일요일 → 일요일까지 연속이면 유지
      when(repo.findLatestStreak(userId)).thenReturn(streak(LocalDate.of(2026, 11, 22), 5));
      assertEquals(5, service.status(userId, MONDAY_IN_SEOUL_SUNDAY_IN_LA).currentStreakDays());
      // 같은 순간 LA는 아직 일요일 → 토요일까지 연속이어도 어제라 유지
      stubZone("America/Los_Angeles");
      when(repo.findLatestStreak(userId)).thenReturn(streak(LocalDate.of(2026, 11, 21), 5));
      assertEquals(5, service.status(userId, MONDAY_IN_SEOUL_SUNDAY_IN_LA).currentStreakDays());
    }
  }

  @Nested class 저장 {

    @Test void 거리_목표를_저장하고_최신_상태를_돌려준다() {
      service.update(userId, new WeeklyGoalRequest("DISTANCE", 15_000));
      verify(repo).upsert(userId, "DISTANCE", 15_000);
    }

    @Test void 횟수_목표를_저장한다() {
      service.update(userId, new WeeklyGoalRequest("RUNS", 3));
      verify(repo).upsert(userId, "RUNS", 3);
    }

    @Test void 잘못된_요청은_400이고_저장하지_않는다() {
      List<WeeklyGoalRequest> invalid = List.of(
          new WeeklyGoalRequest(null, 3),
          new WeeklyGoalRequest("RUNS", null),
          new WeeklyGoalRequest("PACE", 300),
          new WeeklyGoalRequest("distance", 5_000),
          new WeeklyGoalRequest("RUNS", 0),
          new WeeklyGoalRequest("RUNS", 15),
          new WeeklyGoalRequest("DISTANCE", 999),
          new WeeklyGoalRequest("DISTANCE", 300_001));
      for (WeeklyGoalRequest req : invalid) {
        ApiException e = assertThrows(ApiException.class, () -> service.update(userId, req));
        assertEquals("invalid_weekly_goal", e.code());
      }
      ApiException nullBody = assertThrows(ApiException.class, () -> service.update(userId, null));
      assertEquals("invalid_weekly_goal", nullBody.code());
      verify(repo, never()).upsert(any(), anyString(), anyInt());
    }

    @Test void 경계값은_허용한다() {
      service.update(userId, new WeeklyGoalRequest("DISTANCE", 1_000));
      service.update(userId, new WeeklyGoalRequest("DISTANCE", 300_000));
      service.update(userId, new WeeklyGoalRequest("RUNS", 1));
      service.update(userId, new WeeklyGoalRequest("RUNS", 14));
      verify(repo).upsert(userId, "DISTANCE", 1_000);
      verify(repo).upsert(userId, "RUNS", 14);
    }
  }

  @Nested class 달성_판정 {
    private final LocalDateTime wednesdayMorning = LocalDateTime.of(2026, 11, 25, 7, 0);

    @Test void 이번_운동으로_거리_목표를_처음_넘으면_달성이다() {
      stubGoal(WeeklyGoalType.DISTANCE, 15_000, null);
      stubWeekTotals(16_000, 3); // 이번 운동 5km 전에는 11km

      var reach = service.reachedBy(userId, runAtLocal(wednesdayMorning, 5_000), WEDNESDAY);

      assertTrue(reach.isPresent());
      assertEquals(THIS_MONDAY, reach.get().weekStart());
      assertEquals("WEEKLY_GOAL_REACHED", reach.get().achievement().code());
      assertEquals(15_000L, reach.get().achievement().value());
      assertEquals(0L, reach.get().achievement().value2());
    }

    @Test void 딱_목표값에_도달해도_달성이다() {
      stubGoal(WeeklyGoalType.DISTANCE, 15_000, null);
      stubWeekTotals(15_000, 3);
      assertTrue(service.reachedBy(userId, runAtLocal(wednesdayMorning, 4_000), WEDNESDAY).isPresent());
    }

    @Test void 이미_넘은_뒤의_운동은_다시_달성하지_않는다() {
      stubGoal(WeeklyGoalType.DISTANCE, 15_000, null);
      stubWeekTotals(21_000, 4); // 이번 운동 전에도 16km
      assertFalse(service.reachedBy(userId, runAtLocal(wednesdayMorning, 5_000), WEDNESDAY).isPresent());
    }

    @Test void 아직_못_채웠으면_달성이_아니다() {
      stubGoal(WeeklyGoalType.DISTANCE, 15_000, null);
      stubWeekTotals(12_000, 2);
      assertFalse(service.reachedBy(userId, runAtLocal(wednesdayMorning, 5_000), WEDNESDAY).isPresent());
    }

    @Test void 횟수_목표는_이번_운동이_목표_번째면_달성이다() {
      stubGoal(WeeklyGoalType.RUNS, 3, null);
      stubWeekTotals(9_000, 3);
      var reach = service.reachedBy(userId, runAtLocal(wednesdayMorning, 3_000), WEDNESDAY);
      assertTrue(reach.isPresent());
      assertEquals(3L, reach.get().achievement().value());
      assertEquals(1L, reach.get().achievement().value2());

      stubWeekTotals(12_000, 4); // 네 번째 러닝은 이미 채운 뒤
      assertFalse(service.reachedBy(userId, runAtLocal(wednesdayMorning, 3_000), WEDNESDAY).isPresent());
    }

    @Test void 이번_주에_이미_축하했으면_목표를_바꿔_재달성해도_없다() {
      stubGoal(WeeklyGoalType.DISTANCE, 20_000, THIS_MONDAY);
      stubWeekTotals(21_000, 4);
      assertFalse(service.reachedBy(userId, runAtLocal(wednesdayMorning, 5_000), WEDNESDAY).isPresent());
      verify(repo, never()).sumBetween(any(), any(), any());
    }

    @Test void 지난주에_축하한_기록은_이번_주_판정을_막지_않는다() {
      stubGoal(WeeklyGoalType.DISTANCE, 15_000, LAST_MONDAY);
      stubWeekTotals(16_000, 3);
      assertTrue(service.reachedBy(userId, runAtLocal(wednesdayMorning, 5_000), WEDNESDAY).isPresent());
    }

    @Test void 지난주로_소급한_운동은_이번_주_달성을_만들지_않는다() {
      stubGoal(WeeklyGoalType.DISTANCE, 15_000, null);
      stubWeekTotals(16_000, 3);
      LocalDateTime lastSunday = LocalDateTime.of(2026, 11, 22, 23, 30);
      assertFalse(service.reachedBy(userId, runAtLocal(lastSunday, 5_000), WEDNESDAY).isPresent());
    }

    @Test void 목표가_없으면_달성도_없다() {
      assertFalse(service.reachedBy(userId, runAtLocal(wednesdayMorning, 5_000), WEDNESDAY).isPresent());
    }

    @Test void 같은_운동이라도_사용자_시간대의_이번_주에_들어야_한다() {
      stubGoal(WeeklyGoalType.DISTANCE, 15_000, null);
      stubWeekTotals(16_000, 3);
      // LA 사용자에게 지금은 일요일 밤 → 일요일 22시 런은 이번 주(11-16 주)
      Instant laSundayNight = Instant.parse("2026-11-23T07:00:00Z");
      LocalDateTime sunday22 = LocalDateTime.of(2026, 11, 22, 22, 0);
      stubZone("America/Los_Angeles");
      var la = service.reachedBy(userId, runAtLocal(sunday22, 5_000), laSundayNight);
      assertTrue(la.isPresent());
      assertEquals(LAST_MONDAY, la.get().weekStart());
      // 같은 순간 서울은 이미 월요일 → 일요일 런은 지난주
      stubZone("Asia/Seoul");
      assertFalse(service.reachedBy(userId, runAtLocal(sunday22, 5_000), laSundayNight).isPresent());
    }

    @Test void 선점은_한_번만_성공한다() {
      when(repo.claimAchievedWeek(userId, THIS_MONDAY)).thenReturn(1, 0);
      assertTrue(service.claim(userId, THIS_MONDAY));
      assertFalse(service.claim(userId, THIS_MONDAY));
    }
  }

  @Nested class 남은_양 {
    private final LocalDate today = LocalDate.of(2026, 11, 25);

    @Test void 거리_목표의_남은_미터() {
      stubGoal(WeeklyGoalType.DISTANCE, 15_000, null);
      stubWeekTotals(8_200, 2);
      var r = service.remainingThisWeek(userId, today).orElseThrow();
      assertEquals(WeeklyGoalType.DISTANCE, r.type());
      assertEquals(6_800, r.amount());
      verify(repo).sumBetween(userId, THIS_MONDAY.atStartOfDay(), THIS_MONDAY.plusDays(7).atStartOfDay());
    }

    @Test void 횟수_목표의_남은_횟수() {
      stubGoal(WeeklyGoalType.RUNS, 3, null);
      stubWeekTotals(8_200, 2);
      assertEquals(1, service.remainingThisWeek(userId, today).orElseThrow().amount());
    }

    @Test void 이미_채웠거나_목표가_없으면_비어_있다() {
      assertTrue(service.remainingThisWeek(userId, today).isEmpty());
      stubGoal(WeeklyGoalType.RUNS, 3, null);
      stubWeekTotals(8_200, 3);
      assertTrue(service.remainingThisWeek(userId, today).isEmpty());
    }
  }

  @Nested class 추천값 {
    private final com.runrace.backend.goal.domain.WeekWindow thisWeek =
        com.runrace.backend.goal.domain.WeekWindow.containing(LocalDate.of(2026, 11, 25));

    @Test void 기록이_없으면_입문_기본값() {
      assertEquals(
          new WeeklyGoalResponse.Suggestion(5_000, 2, false),
          WeeklyGoalSuggester.suggest(List.of(), thisWeek));
    }

    @Test void 주_평균을_거리는_km_올림_횟수는_반올림한다() {
      var rows = List.of(
          week(THIS_MONDAY.minusWeeks(4), 10_000, 2),
          week(THIS_MONDAY.minusWeeks(3), 12_000, 3),
          week(THIS_MONDAY.minusWeeks(2), 8_000, 2),
          week(THIS_MONDAY.minusWeeks(1), 11_000, 3));
      // 평균 10.25km → 11km, 2.5회 → 3회
      assertEquals(
          new WeeklyGoalResponse.Suggestion(11_000, 3, true),
          WeeklyGoalSuggester.suggest(rows, thisWeek));
    }

    @Test void 앞쪽_빈_주는_평균에서_빼고_중간_빈_주는_포함한다() {
      var rows = List.of(
          week(THIS_MONDAY.minusWeeks(3), 9_000, 3),
          week(THIS_MONDAY.minusWeeks(1), 9_000, 3));
      // 4주 전은 앞쪽 공백이라 제외, 2주 전 공백은 포함 → 18km/3주=6km, 6회/3주=2회
      assertEquals(
          new WeeklyGoalResponse.Suggestion(6_000, 2, true),
          WeeklyGoalSuggester.suggest(rows, thisWeek));
    }

    @Test void 이번_주와_더_이전_주는_무시한다() {
      var rows = List.of(
          week(THIS_MONDAY, 40_000, 6),
          week(THIS_MONDAY.minusWeeks(5), 40_000, 6),
          week(THIS_MONDAY.minusWeeks(1), 4_200, 1));
      assertEquals(
          new WeeklyGoalResponse.Suggestion(5_000, 1, true),
          WeeklyGoalSuggester.suggest(rows, thisWeek));
    }

    @Test void 추천값은_저장_가능한_범위로_자른다() {
      var tiny = List.of(week(THIS_MONDAY.minusWeeks(1), 500, 1));
      assertEquals(2_000, WeeklyGoalSuggester.suggest(tiny, thisWeek).distanceM());
      var huge = List.of(week(THIS_MONDAY.minusWeeks(1), 900_000, 40));
      var s = WeeklyGoalSuggester.suggest(huge, thisWeek);
      assertEquals(300_000, s.distanceM());
      assertEquals(14, s.runs());
    }
  }
}
