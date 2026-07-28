package com.runrace.backend.workout.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.runrace.backend.crew.domain.Crew;
import com.runrace.backend.crew.domain.CrewMember;
import com.runrace.backend.crew.repository.CrewMemberRepository;
import com.runrace.backend.workout.domain.WorkoutSession;
import com.runrace.backend.workout.dto.Achievement;
import com.runrace.backend.workout.repository.WorkoutSessionRepository;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

class AchievementServiceTest {

  private final WorkoutSessionRepository workoutRepo = mock(WorkoutSessionRepository.class);
  private final CrewMemberRepository crewRepo = mock(CrewMemberRepository.class);
  private final AchievementService service = new AchievementService(workoutRepo, crewRepo);
  private final UUID userId = UUID.randomUUID();

  private static WorkoutSession run(int distanceM) {
    return runAt(distanceM, OffsetDateTime.now());
  }

  private static WorkoutSession runAt(int distanceM, OffsetDateTime startedAt) {
    return WorkoutSession.builder()
        .id(1L)
        .distanceM(distanceM)
        .durationSec(1800)
        .startedAt(startedAt)
        .endedAt(startedAt.plusMinutes(30))
        .build();
  }

  /** 집계 결과(총 횟수·총 거리) 스텁. */
  private void stubSummary(long runs, long totalDistanceM) {
    var agg = mock(WorkoutSessionRepository.WorkoutSummaryAggregate.class);
    when(agg.getWorkoutCount()).thenReturn(runs);
    when(agg.getTotalDistanceM()).thenReturn(totalDistanceM);
    when(workoutRepo.aggregateForUser(userId)).thenReturn(agg);
  }

  private static List<String> codes(List<Achievement> list) {
    return list.stream().map(Achievement::code).toList();
  }

  @BeforeEach void 기본_스텁() {
    // 기본값: 기록 아님, 연속일 없음, 크루 미소속.
    when(workoutRepo.countRunsAtLeastDistanceSince(any(), any(), anyInt(), any())).thenReturn(5L);
    when(workoutRepo.countByUserIdAndStartedAtGreaterThanEqual(any(), any())).thenReturn(1L);
    when(workoutRepo.currentStreakDaysForUser(any())).thenReturn(1);
    when(crewRepo.findByUserId(any())).thenReturn(Optional.empty());
  }

  @Nested class 기본_동작 {

    @Test void 너무_짧은_러닝은_성과를_계산하지_않는다() {
      assertTrue(service.evaluate(userId, run(200)).isEmpty());
    }

    @Test void 첫_러닝은_FIRST_RUN만_노출() {
      stubSummary(1, 5_000);
      assertEquals(List.of("FIRST_RUN"), codes(service.evaluate(userId, run(5_000))));
    }

    @Test void 특별한_기록이_없어도_최소_하나는_나온다() {
      stubSummary(20, 100_000);
      assertFalse(service.evaluate(userId, run(5_000)).isEmpty());
    }

    @Test void 최대_3개까지만_노출() {
      // 역대 최장 + 연속 7일 + 누적 100km 돌파 + 이번 주 3회째 → 상위 3개로 잘림
      stubSummary(30, 100_000);
      when(workoutRepo.countRunsAtLeastDistanceSince(any(), any(), anyInt(), any())).thenReturn(0L);
      when(workoutRepo.currentStreakDaysForUser(userId)).thenReturn(7);
      when(workoutRepo.countByUserIdAndStartedAtGreaterThanEqual(any(), any())).thenReturn(1L, 3L);

      assertEquals(3, service.evaluate(userId, run(10_000)).size());
    }
  }

  @Nested class 거리_기록 {

    @Test void 더_긴_러닝이_없으면_역대_최장() {
      stubSummary(10, 50_000);
      when(workoutRepo.countRunsAtLeastDistanceSince(any(), any(), anyInt(), any())).thenReturn(0L);

      assertTrue(codes(service.evaluate(userId, run(12_000))).contains("ALL_TIME_DISTANCE"));
    }

    @Test void 역대는_아니지만_올해_최장이면_YEAR_DISTANCE() {
      stubSummary(10, 50_000);
      // 역대(EPOCH 기준)만 더 긴 기록 존재, 그 외 기간은 없음
      when(workoutRepo.countRunsAtLeastDistanceSince(any(), any(), anyInt(), any())).thenReturn(0L);
      when(workoutRepo.countRunsAtLeastDistanceSince(
          eq(userId), any(), anyInt(),
          eq(java.time.Instant.EPOCH.atZone(com.runrace.backend.common.KstTime.ZONE).toOffsetDateTime())))
          .thenReturn(2L);

      var result = codes(service.evaluate(userId, run(12_000)));
      assertTrue(result.contains("YEAR_DISTANCE"));
      assertFalse(result.contains("ALL_TIME_DISTANCE"));
    }

    @Test void 짧은_거리는_최장거리_성과를_만들지_않는다() {
      stubSummary(10, 50_000);
      when(workoutRepo.countRunsAtLeastDistanceSince(any(), any(), anyInt(), any())).thenReturn(0L);

      var result = codes(service.evaluate(userId, run(800)));
      assertFalse(result.contains("ALL_TIME_DISTANCE"));
    }
  }

  @Nested class 연속일 {

    @Test void 마일스톤_도달시_STREAK() {
      stubSummary(10, 50_000);
      when(workoutRepo.currentStreakDaysForUser(userId)).thenReturn(7);

      assertTrue(codes(service.evaluate(userId, run(5_000))).contains("STREAK"));
    }

    @Test void 마일스톤이_아닌_연속일은_노출하지_않는다() {
      stubSummary(10, 50_000);
      when(workoutRepo.currentStreakDaysForUser(userId)).thenReturn(5);

      assertFalse(codes(service.evaluate(userId, run(5_000))).contains("STREAK"));
    }

    @Test void 같은_날_두번째_러닝은_연속일_성과를_재발화하지_않는다() {
      stubSummary(10, 50_000);
      when(workoutRepo.countByUserIdAndStartedAtGreaterThanEqual(any(), any())).thenReturn(2L);
      when(workoutRepo.currentStreakDaysForUser(userId)).thenReturn(7);

      assertFalse(codes(service.evaluate(userId, run(5_000))).contains("STREAK"));
    }
  }

  @Nested class 누적_마일스톤 {

    @Test void 소급_실내런도_누적_성과에는_포함하지만_현재기간_성과는_제외() {
      stubSummary(50, 101_000);
      OffsetDateTime lastYear = OffsetDateTime.now().minusYears(1);

      var result = codes(service.evaluate(userId, runAt(5_000, lastYear)));

      assertTrue(result.contains("TOTAL_DISTANCE"));
      assertTrue(result.contains("TOTAL_RUNS"));
      assertFalse(result.contains("STREAK"));
      assertFalse(result.contains("WEEK_COUNT"));
      assertFalse(result.contains("FIRST_RUN_OF_WEEK"));
      assertFalse(result.contains("YEAR_DISTANCE"));
      assertFalse(result.contains("MONTH30_DISTANCE"));
      assertFalse(result.contains("WEEK_DISTANCE"));
    }

    @Test void 이번_운동으로_100km를_넘으면_TOTAL_DISTANCE() {
      stubSummary(30, 101_000); // 직전 96km → 101km
      assertTrue(codes(service.evaluate(userId, run(5_000))).contains("TOTAL_DISTANCE"));
    }

    @Test void 이미_넘긴_마일스톤은_다시_발화하지_않는다() {
      stubSummary(30, 150_000); // 직전 145km — 100km는 이전에 이미 통과
      assertFalse(codes(service.evaluate(userId, run(5_000))).contains("TOTAL_DISTANCE"));
    }

    @Test void 통산_횟수_마일스톤이면_TOTAL_RUNS() {
      stubSummary(50, 300_000);
      assertTrue(codes(service.evaluate(userId, run(5_000))).contains("TOTAL_RUNS"));
    }
  }

  @Nested class 크루 {

    private void stubCrew(BigDecimal monthGoalKm, int memberCount,
        List<CrewMemberRepository.MemberDistanceAgg> rows) {
      Crew crew = mock(Crew.class);
      when(crew.getId()).thenReturn(10L);
      when(crew.getMonthGoalKm()).thenReturn(monthGoalKm);
      CrewMember member = mock(CrewMember.class);
      when(member.getCrew()).thenReturn(crew);
      when(crewRepo.findByUserId(userId)).thenReturn(Optional.of(member));
      when(crewRepo.countByCrewId(10L)).thenReturn(memberCount);
      when(crewRepo.sumMemberDistanceSince(eq(10L), any())).thenReturn(rows);
    }

    private CrewMemberRepository.MemberDistanceAgg agg(UUID id, long distanceM) {
      var row = mock(CrewMemberRepository.MemberDistanceAgg.class);
      when(row.getUserId()).thenReturn(id);
      when(row.getDistanceM()).thenReturn(distanceM);
      return row;
    }

    @Test void 이번_운동으로_월목표를_달성하면_CREW_GOAL_REACHED() {
      stubSummary(20, 200_000);
      // 목표 50km, 이번 달 누적 52km(직전 47km) → 이번 운동으로 100% 돌파
      stubCrew(BigDecimal.valueOf(50), 5, List.of(agg(userId, 52_000)));

      assertTrue(codes(service.evaluate(userId, run(5_000))).contains("CREW_GOAL_REACHED"));
    }

    @Test void 이미_달성한_목표는_재발화하지_않는다() {
      stubSummary(20, 200_000);
      // 직전에 이미 80km로 목표 초과 상태
      stubCrew(BigDecimal.valueOf(50), 5, List.of(agg(userId, 85_000)));

      assertFalse(codes(service.evaluate(userId, run(5_000))).contains("CREW_GOAL_REACHED"));
    }

    @Test void 크루_상위권이면_CREW_RANK() {
      stubSummary(20, 200_000);
      UUID other1 = UUID.randomUUID();
      UUID other2 = UUID.randomUUID();
      stubCrew(null, 5, List.of(agg(userId, 50_000), agg(other1, 30_000), agg(other2, 10_000)));

      var result = service.evaluate(userId, run(5_000));
      var rank = result.stream().filter(a -> a.code().equals("CREW_RANK")).findFirst();
      assertTrue(rank.isPresent());
      assertEquals(1L, rank.get().value());
      assertEquals(5L, rank.get().value2());
    }

    @Test void 동거리_동점자는_같은_순위다() {
      stubSummary(20, 200_000);
      UUID other = UUID.randomUUID();
      // 동거리 1위가 리스트에서 내 앞에 있어도, 정렬 순서가 아니라
      // "나보다 엄격히 많이 뛴 사람 수 + 1"로 계산해 공동 1위여야 한다.
      stubCrew(null, 5, List.of(agg(other, 50_000), agg(userId, 50_000)));

      var rank = service.evaluate(userId, run(5_000)).stream()
          .filter(a -> a.code().equals("CREW_RANK")).findFirst();
      assertTrue(rank.isPresent());
      assertEquals(1L, rank.get().value());
    }

    @Test void 하위권이면_순위_성과를_만들지_않는다_패배감_방지() {
      stubSummary(20, 200_000);
      UUID o1 = UUID.randomUUID();
      UUID o2 = UUID.randomUUID();
      UUID o3 = UUID.randomUUID();
      stubCrew(null, 5, List.of(
          agg(o1, 90_000), agg(o2, 80_000), agg(o3, 70_000), agg(userId, 5_000)));

      assertFalse(codes(service.evaluate(userId, run(5_000))).contains("CREW_RANK"));
    }

    @Test void 인원이_너무_적은_크루는_순위_성과를_만들지_않는다() {
      stubSummary(20, 200_000);
      stubCrew(null, 2, List.of(agg(userId, 50_000)));

      assertFalse(codes(service.evaluate(userId, run(5_000))).contains("CREW_RANK"));
    }

    @Test void 크루_미소속이면_크루_성과가_없다() {
      stubSummary(20, 200_000);
      var result = codes(service.evaluate(userId, run(5_000)));
      assertFalse(result.contains("CREW_RANK"));
      assertFalse(result.contains("CREW_GOAL_REACHED"));
    }
  }
}
