package com.runrace.backend.workout.service;

import com.runrace.backend.common.KstTime;
import com.runrace.backend.crew.domain.Crew;
import com.runrace.backend.crew.domain.CrewMember;
import com.runrace.backend.crew.repository.CrewMemberRepository;
import com.runrace.backend.workout.domain.WorkoutSession;
import com.runrace.backend.workout.dto.Achievement;
import com.runrace.backend.workout.repository.WorkoutSessionRepository;
import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 운동 저장 직후 "오늘의 성과"를 규칙 기반으로 계산한다(AI 없음).
 * 강한 성과부터 찾아 내려가며, 항상 최소 하나는 긍정 성과가 나오도록 소프트 폴백을 둔다.
 * 패배·후퇴 프레이밍은 절대 만들지 않는다(못 이긴 항목은 그냥 제외).
 * 결과는 강도(tier) 내림차순 상위 {@link #MAX_ACHIEVEMENTS}개. 문구 로컬라이즈는 프론트가 한다.
 */
@Service
@RequiredArgsConstructor
public class AchievementService {

  private static final int MAX_ACHIEVEMENTS = 3;
  /** 이 거리 미만(미스탭·초단거리)은 성과를 계산하지 않는다. */
  private static final int MIN_MEANINGFUL_DISTANCE_M = 300;
  /** 거리 기록(역대/올해/…) 성과의 최소 거리 — 초단거리가 "최장"으로 뜨는 것 방지. */
  private static final int MIN_RECORD_DISTANCE_M = 1_000;

  private static final ZoneId KST = KstTime.ZONE;
  private static final OffsetDateTime EPOCH = Instant.EPOCH.atZone(KST).toOffsetDateTime();

  private static final long[] STREAK_MILESTONES = {3, 7, 14, 30, 50, 100, 200, 365};
  private static final long[] RUN_COUNT_MILESTONES = {10, 50, 100, 200, 500, 1000};
  private static final long[] DISTANCE_MILESTONES_KM = {100, 300, 500, 1000, 2000, 3000, 5000};
  private static final long[] CREW_GOAL_BANDS = {50, 80};

  private final WorkoutSessionRepository workoutRepository;
  private final CrewMemberRepository crewMemberRepository;

  /** 내부 정렬용 — tier가 클수록 강한(드문) 성과라 먼저 노출된다. */
  private record Scored(int tier, Achievement achievement) {}

  @Transactional(readOnly = true)
  public List<Achievement> evaluate(UUID userId, WorkoutSession saved) {
    int distanceM = saved.getDistanceM();
    if (distanceM < MIN_MEANINGFUL_DISTANCE_M) return List.of();

    List<Scored> out = new ArrayList<>();

    OffsetDateTime todayStart = LocalDate.now(KST).atStartOfDay(KST).toOffsetDateTime();
    OffsetDateTime weekStart =
        LocalDate.now(KST).with(DayOfWeek.MONDAY).atStartOfDay(KST).toOffsetDateTime();

    WorkoutSessionRepository.WorkoutSummaryAggregate agg =
        workoutRepository.aggregateForUser(userId);
    long totalRuns = agg.getWorkoutCount();
    long totalDistanceM = agg.getTotalDistanceM();

    // 첫 러닝 — 이 경우 나머지 개인 성과는 전부 자명하므로 이것만 노출한다.
    if (totalRuns <= 1) {
      out.add(new Scored(100, Achievement.of("FIRST_RUN")));
    } else {
      addDistanceRecord(out, userId, saved, todayStart, weekStart);
      addStreak(out, userId, saved, todayStart);
      addTotalDistanceMilestone(out, distanceM, totalDistanceM);
      addTotalRunsMilestone(out, totalRuns);
      addWeekCount(out, userId, weekStart);
    }

    addCrewAchievements(out, userId, distanceM);

    return out.stream()
        .sorted(Comparator.comparingInt(Scored::tier).reversed())
        .limit(MAX_ACHIEVEMENTS)
        .map(Scored::achievement)
        .toList();
  }

  /** 역대 > 올해 > 최근 30일 > 이번 주 순으로 가장 강한 "최장 거리" 하나만 추가. */
  private void addDistanceRecord(
      List<Scored> out, UUID userId, WorkoutSession saved,
      OffsetDateTime todayStart, OffsetDateTime weekStart) {
    int distanceM = saved.getDistanceM();
    if (distanceM < MIN_RECORD_DISTANCE_M) return;
    Long id = saved.getId();

    if (isLongestSince(userId, id, distanceM, EPOCH)) {
      out.add(new Scored(90, Achievement.of("ALL_TIME_DISTANCE", distanceM)));
      return;
    }
    OffsetDateTime yearStart =
        LocalDate.now(KST).withDayOfMonth(1).withMonth(1).atStartOfDay(KST).toOffsetDateTime();
    if (isLongestSince(userId, id, distanceM, yearStart)) {
      out.add(new Scored(70, Achievement.of("YEAR_DISTANCE", distanceM)));
      return;
    }
    OffsetDateTime thirtyDaysAgo = OffsetDateTime.now().minusDays(30);
    if (isLongestSince(userId, id, distanceM, thirtyDaysAgo)) {
      out.add(new Scored(60, Achievement.of("MONTH30_DISTANCE", distanceM)));
      return;
    }
    if (isLongestSince(userId, id, distanceM, weekStart)) {
      out.add(new Scored(50, Achievement.of("WEEK_DISTANCE", distanceM)));
    }
  }

  private boolean isLongestSince(UUID userId, Long excludeId, int distanceM, OffsetDateTime from) {
    return workoutRepository.countRunsAtLeastDistanceSince(userId, excludeId, distanceM, from) == 0;
  }

  /** 오늘의 첫 운동일 때만, 현재 연속일이 마일스톤에 정확히 도달하면 성과. */
  private void addStreak(List<Scored> out, UUID userId, WorkoutSession saved, OffsetDateTime todayStart) {
    // 같은 날 두 번째 러닝은 연속일을 바꾸지 않으므로 재발화하지 않게 오늘 첫 운동만 대상.
    if (workoutRepository.countByUserIdAndStartedAtGreaterThanEqual(userId, todayStart) != 1) return;
    int streak = workoutRepository.currentStreakDaysForUser(userId);
    if (contains(STREAK_MILESTONES, streak)) {
      out.add(new Scored(80, Achievement.of("STREAK", streak)));
    }
  }

  /** 이 운동으로 누적 거리가 마일스톤(km)을 넘어섰으면 성과. */
  private void addTotalDistanceMilestone(List<Scored> out, int distanceM, long totalDistanceM) {
    long prev = totalDistanceM - distanceM;
    for (long km : DISTANCE_MILESTONES_KM) {
      long thresholdM = km * 1000;
      if (prev < thresholdM && totalDistanceM >= thresholdM) {
        out.add(new Scored(75, Achievement.of("TOTAL_DISTANCE", km)));
        return; // 한 운동으로 여러 마일스톤을 넘는 일은 사실상 없으니 가장 낮은 하나만
      }
    }
  }

  private void addTotalRunsMilestone(List<Scored> out, long totalRuns) {
    if (contains(RUN_COUNT_MILESTONES, totalRuns)) {
      out.add(new Scored(65, Achievement.of("TOTAL_RUNS", totalRuns)));
    }
  }

  private void addWeekCount(List<Scored> out, UUID userId, OffsetDateTime weekStart) {
    long weekCount = workoutRepository.countByUserIdAndStartedAtGreaterThanEqual(userId, weekStart);
    if (weekCount >= 2) {
      out.add(new Scored(30, Achievement.of("WEEK_COUNT", weekCount)));
    } else {
      out.add(new Scored(25, Achievement.of("FIRST_RUN_OF_WEEK")));
    }
  }

  /** 크루 소속이면: 이번 달 공통 개인 목표 달성/진행 + 이번 달 크루 내 순위. */
  private void addCrewAchievements(List<Scored> out, UUID userId, int distanceM) {
    CrewMember membership = crewMemberRepository.findByUserId(userId).orElse(null);
    if (membership == null) return;
    Crew crew = membership.getCrew();

    OffsetDateTime monthStart =
        LocalDate.now(KST).withDayOfMonth(1).atStartOfDay(KST).toOffsetDateTime();
    List<CrewMemberRepository.MemberDistanceAgg> rows =
        crewMemberRepository.sumMemberDistanceSince(crew.getId(), monthStart);

    long myMonthDist = rows.stream()
        .filter(r -> r.getUserId().equals(userId))
        .mapToLong(CrewMemberRepository.MemberDistanceAgg::getDistanceM)
        .findFirst()
        .orElse(distanceM);

    addCrewGoal(out, crew, myMonthDist, distanceM);
    addCrewRank(out, rows, userId, crew.getId());
  }

  private void addCrewGoal(List<Scored> out, Crew crew, long myMonthDist, int distanceM) {
    BigDecimal goalKm = crew.getMonthGoalKm();
    if (goalKm == null) return;
    double goalM = goalKm.doubleValue() * 1000;
    if (goalM <= 0) return;

    long prev = myMonthDist - distanceM;
    double curPct = myMonthDist / goalM * 100;
    double prevPct = prev / goalM * 100;

    // 100% 돌파(달성)가 가장 강함.
    if (prevPct < 100 && curPct >= 100) {
      out.add(new Scored(88, Achievement.of("CREW_GOAL_REACHED")));
      return;
    }
    // 아직 미달이면, 이번 운동으로 새로 넘어선 진행 밴드(80% > 50%) 중 가장 높은 것 하나.
    for (int i = CREW_GOAL_BANDS.length - 1; i >= 0; i--) {
      long band = CREW_GOAL_BANDS[i];
      if (prevPct < band && curPct >= band) {
        out.add(new Scored(58, Achievement.of("CREW_GOAL_PROGRESS", band)));
        return;
      }
    }
  }

  private void addCrewRank(
      List<Scored> out, List<CrewMemberRepository.MemberDistanceAgg> rows,
      UUID userId, Long crewId) {
    int memberCount = crewMemberRepository.countByCrewId(crewId);
    if (memberCount < 3) return;

    // 이번 달 거리 내림차순 순위(0km 미기록 멤버는 rows에 없음 → 뛴 사람 중 순위).
    List<UUID> ranked = rows.stream()
        .sorted(Comparator.comparingLong(CrewMemberRepository.MemberDistanceAgg::getDistanceM).reversed())
        .map(CrewMemberRepository.MemberDistanceAgg::getUserId)
        .toList();
    int idx = ranked.indexOf(userId);
    if (idx < 0) return;
    int rank = idx + 1;
    if (rank <= 3) {
      out.add(new Scored(55, Achievement.of("CREW_RANK", rank, memberCount)));
    }
  }

  private static boolean contains(long[] arr, long v) {
    for (long a : arr) if (a == v) return true;
    return false;
  }
}
