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
import java.time.LocalDate;
import java.time.LocalDateTime;
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
 * 강한 성과부터 찾아 내려가되, <b>내세울 것이 없으면 빈 목록을 반환한다</b> —
 * 매번 뭐라도 띄우려고 억지 폴백을 두면 성과 자체가 값싸져서, 의미 있는 것만 남긴다.
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
  /** "역대" 판정용 하한 — started_at_local(기기 벽시계)과 비교하므로 로컬 타입. */
  private static final LocalDateTime EPOCH_LOCAL = LocalDateTime.of(1970, 1, 1, 0, 0);

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

    // 현재 기간 성과는 서버 운영 기준(KST)으로 판정한다. 저장된 운동 날짜에서 경계를 만들면
    // 모든 과거 운동이 자기 날짜의 "오늘/올해"에 포함되는 항진식이 되어 소급 기록도 성과를 만든다.
    LocalDate today = LocalDate.now(KST);
    LocalDate refDate = saved.getStartedAtLocal().toLocalDate();
    LocalDateTime todayStart = today.atStartOfDay();
    // 크루 성과는 공동 마감이라 KST 유지 — 크루 월간 보드와 같은 경계를 써야 순위가 맞는다.
    OffsetDateTime monthStart =
        today.withDayOfMonth(1).atStartOfDay(KST).toOffsetDateTime();

    WorkoutSessionRepository.WorkoutSummaryAggregate agg =
        workoutRepository.aggregateForUser(userId);
    long totalRuns = agg.getWorkoutCount();
    long totalDistanceM = agg.getTotalDistanceM();

    // 첫 러닝 — 이 경우 나머지 개인 성과는 전부 자명하므로 이것만 노출한다.
    if (totalRuns <= 1) {
      out.add(new Scored(100, Achievement.of("FIRST_RUN")));
    } else {
      addDistanceRecord(out, userId, saved, today);
      if (refDate.equals(today)) {
        addStreak(out, userId, todayStart);
      }
      addTotalDistanceMilestone(out, distanceM, totalDistanceM);
      addTotalRunsMilestone(out, totalRuns);
    }

    if (!saved.getStartedAt().isBefore(monthStart)) {
      addCrewAchievements(out, userId, distanceM, monthStart);
    }

    return out.stream()
        .sorted(Comparator.comparingInt(Scored::tier).reversed())
        .limit(MAX_ACHIEVEMENTS)
        .map(Scored::achievement)
        .toList();
  }

  /** 역대 > 올해 > 최근 30일 > 이번 주 순으로 가장 강한 "최장 거리" 하나만 추가. */
  private void addDistanceRecord(
      List<Scored> out, UUID userId, WorkoutSession saved, LocalDate today) {
    int distanceM = saved.getDistanceM();
    if (distanceM < MIN_RECORD_DISTANCE_M) return;
    Long id = saved.getId();

    if (isLongestSince(userId, id, distanceM, EPOCH_LOCAL)) {
      out.add(new Scored(90, Achievement.of("ALL_TIME_DISTANCE", distanceM)));
      return;
    }
    LocalDateTime yearStart = today.withDayOfYear(1).atStartOfDay();
    if (!saved.getStartedAtLocal().isBefore(yearStart)
        && isLongestSince(userId, id, distanceM, yearStart)) {
      out.add(new Scored(70, Achievement.of("YEAR_DISTANCE", distanceM)));
      return;
    }
    LocalDateTime thirtyDaysAgo = today.minusDays(30).atStartOfDay();
    if (!saved.getStartedAtLocal().isBefore(thirtyDaysAgo)
        && isLongestSince(userId, id, distanceM, thirtyDaysAgo)) {
      out.add(new Scored(60, Achievement.of("MONTH30_DISTANCE", distanceM)));
      return;
    }
    LocalDateTime weekStart = today.with(DayOfWeek.MONDAY).atStartOfDay();
    if (!saved.getStartedAtLocal().isBefore(weekStart)
        && isLongestSince(userId, id, distanceM, weekStart)) {
      out.add(new Scored(50, Achievement.of("WEEK_DISTANCE", distanceM)));
    }
  }

  private boolean isLongestSince(UUID userId, Long excludeId, int distanceM, LocalDateTime from) {
    return workoutRepository.countRunsAtLeastDistanceSince(userId, excludeId, distanceM, from) == 0;
  }

  /** 오늘의 첫 운동일 때만, 현재 연속일이 마일스톤에 정확히 도달하면 성과. */
  private void addStreak(List<Scored> out, UUID userId, LocalDateTime todayStart) {
    // 같은 날 두 번째 러닝은 연속일을 바꾸지 않으므로 재발화하지 않게 오늘 첫 운동만 대상.
    if (workoutRepository.countByUserIdAndStartedAtLocalGreaterThanEqual(userId, todayStart) != 1) return;
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

  /** 크루 소속이면: 이번 달 공통 개인 목표 달성/진행 + 이번 달 크루 내 순위. */
  private void addCrewAchievements(
      List<Scored> out, UUID userId, int distanceM, OffsetDateTime monthStart) {
    CrewMember membership = crewMemberRepository.findByUserId(userId).orElse(null);
    if (membership == null) return;
    Crew crew = membership.getCrew();

    List<CrewMemberRepository.MemberDistanceAgg> rows =
        crewMemberRepository.sumMemberDistanceSince(crew.getId(), monthStart);

    long myMonthDist = rows.stream()
        .filter(r -> r.getUserId().equals(userId))
        .mapToLong(CrewMemberRepository.MemberDistanceAgg::getDistanceM)
        .findFirst()
        .orElse(distanceM);

    addCrewGoal(out, crew, myMonthDist, distanceM);
    addCrewRank(out, rows, userId, crew.getId(), distanceM);
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
      UUID userId, Long crewId, int distanceM) {
    int memberCount = crewMemberRepository.countByCrewId(crewId);
    if (memberCount < 3) return;

    // 이번 달 거리 내림차순 순위(0km 미기록 멤버는 rows에 없음 → 뛴 사람 중 순위).
    // 동거리는 동순위(나보다 엄격히 많이 뛴 사람 수 + 1) — 정렬 순서에 따라 등수가 흔들리지 않는다.
    long myDist = rows.stream()
        .filter(r -> r.getUserId().equals(userId))
        .mapToLong(CrewMemberRepository.MemberDistanceAgg::getDistanceM)
        .findFirst()
        .orElse(-1);
    if (myDist < 0) return;
    long previousMyDist = Math.max(0, myDist - distanceM);
    int previousRank =
        (int) rows.stream()
            .filter(r -> !r.getUserId().equals(userId))
            .filter(r -> r.getDistanceM() > previousMyDist)
            .count() + 1;
    int currentRank =
        (int) rows.stream()
            .filter(r -> !r.getUserId().equals(userId))
            .filter(r -> r.getDistanceM() > myDist)
            .count() + 1;
    if (currentRank <= 3 && currentRank < previousRank) {
      out.add(new Scored(55, Achievement.of("CREW_RANK", currentRank, memberCount)));
    }
  }

  private static boolean contains(long[] arr, long v) {
    for (long a : arr) if (a == v) return true;
    return false;
  }
}
