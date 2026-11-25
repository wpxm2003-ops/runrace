package com.runrace.backend.goal.service;

import com.runrace.backend.common.ApiException;
import com.runrace.backend.common.KstTime;
import com.runrace.backend.goal.domain.WeekWindow;
import com.runrace.backend.goal.domain.WeeklyGoal;
import com.runrace.backend.goal.domain.WeeklyGoalType;
import com.runrace.backend.goal.dto.WeeklyGoalRequest;
import com.runrace.backend.goal.dto.WeeklyGoalResponse;
import com.runrace.backend.goal.repository.WeeklyGoalRepository;
import com.runrace.backend.goal.repository.WeeklyGoalRepository.LatestStreak;
import com.runrace.backend.goal.repository.WeeklyGoalRepository.PeriodTotals;
import com.runrace.backend.workout.domain.WorkoutSession;
import com.runrace.backend.workout.dto.Achievement;
import java.time.DateTimeException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 개인 주간 목표 — 조회·저장, 이번 주 진척·현재 연속 기록, 저장 시 달성 판정, 푸시용 남은 양.
 *
 * <p>주 경계는 {@link WeekWindow}(월요일 시작, started_at_local 벽시계)를 따르고, "오늘"은
 * 사용자 시간대(users.time_zone, 기기에서 동기화)로 정한다. 홈 '이번 주 활동' 카드가 기기의 오늘로
 * 주를 고르는 것과 같은 결과가 되도록 하기 위함이다. 시간대가 없거나 잘못됐으면 KST로 본다
 * (ReengagementScheduler와 같은 폴백).
 */
@Service
@RequiredArgsConstructor
public class WeeklyGoalService {
  /** 저장 직후 성과 코드. value=목표값(미터 또는 횟수), value2=종류(0=거리, 1=횟수). */
  public static final String ACHIEVEMENT_CODE = "WEEKLY_GOAL_REACHED";

  private final WeeklyGoalRepository weeklyGoalRepository;

  /** 저장 직후 판정 결과 — 아직 선점({@link #claim}) 전이다. */
  public record WeeklyGoalReach(LocalDate weekStart, Achievement achievement) {}

  /** 이번 주 목표까지 남은 양. DISTANCE면 미터, RUNS면 횟수(항상 양수). */
  public record Remaining(WeeklyGoalType type, long amount) {}

  @Transactional(readOnly = true)
  public WeeklyGoalResponse status(UUID userId) {
    return status(userId, Instant.now());
  }

  WeeklyGoalResponse status(UUID userId, Instant now) {
    LocalDate today = todayFor(userId, now);
    WeekWindow week = WeekWindow.containing(today);
    WeeklyGoal goal = weeklyGoalRepository.findById(userId).orElse(null);
    PeriodTotals totals = weeklyGoalRepository.sumBetween(userId, week.from(), week.to());
    LatestStreak streak = weeklyGoalRepository.findLatestStreak(userId);
    var recentWeeks = weeklyGoalRepository.sumByWeekBetween(
        userId, week.minusWeeks(WeeklyGoalSuggester.LOOKBACK_WEEKS).from(), week.from());

    return new WeeklyGoalResponse(
        goal == null ? null : new WeeklyGoalResponse.Goal(goal.getGoalType().name(), goal.getTargetValue()),
        week.start().toString(),
        totals.getDistanceM(),
        totals.getRuns(),
        currentStreak(streak, today),
        WeeklyGoalSuggester.suggest(recentWeeks, week));
  }

  @Transactional
  public WeeklyGoalResponse update(UUID userId, WeeklyGoalRequest request) {
    if (request == null || request.type() == null || request.target() == null) {
      throw ApiException.badRequest("invalid_weekly_goal");
    }
    WeeklyGoalType type;
    try {
      type = WeeklyGoalType.valueOf(request.type());
    } catch (IllegalArgumentException e) {
      throw ApiException.badRequest("invalid_weekly_goal");
    }
    if (!type.accepts(request.target())) {
      throw ApiException.badRequest("invalid_weekly_goal");
    }
    weeklyGoalRepository.upsert(userId, type.name(), request.target());
    return status(userId, Instant.now());
  }

  /**
   * 방금 저장한 운동으로 이번 주 목표를 처음 넘었는지 판정한다.
   * 이 운동 전에는 미달이었고 지금은 달성, 그리고 이번 주에 아직 축하하지 않았을 때만 결과가 있다.
   * 지난주로 소급 입력한 운동은 이번 주 진척과 무관하므로 제외한다.
   */
  public Optional<WeeklyGoalReach> reachedBy(UUID userId, WorkoutSession saved) {
    return reachedBy(userId, saved, Instant.now());
  }

  Optional<WeeklyGoalReach> reachedBy(UUID userId, WorkoutSession saved, Instant now) {
    WeeklyGoal goal = weeklyGoalRepository.findById(userId).orElse(null);
    if (goal == null) return Optional.empty();
    WeekWindow week = WeekWindow.containing(todayFor(userId, now));
    if (week.start().equals(goal.getLastAchievedWeek())) return Optional.empty();
    if (saved.getStartedAtLocal() == null || !week.contains(saved.getStartedAtLocal())) {
      return Optional.empty();
    }

    PeriodTotals totals = weeklyGoalRepository.sumBetween(userId, week.from(), week.to());
    boolean distance = goal.getGoalType() == WeeklyGoalType.DISTANCE;
    long current = distance ? totals.getDistanceM() : totals.getRuns();
    long before = current - (distance ? saved.getDistanceM() : 1);
    int target = goal.getTargetValue();
    if (before >= target || current < target) return Optional.empty();

    return Optional.of(new WeeklyGoalReach(
        week.start(),
        Achievement.of(ACHIEVEMENT_CODE, target, goal.getGoalType().achievementCode())));
  }

  /** 이번 주 달성 축하를 선점한다. 같은 주에 이미 축하했으면 false(주당 1회). */
  @Transactional
  public boolean claim(UUID userId, LocalDate weekStart) {
    return weeklyGoalRepository.claimAchievedWeek(userId, weekStart) == 1;
  }

  /** 목표가 있고 이번 주에 아직 못 채웠으면 남은 양. {@code today}는 사용자 시간대의 오늘. */
  @Transactional(readOnly = true)
  public Optional<Remaining> remainingThisWeek(UUID userId, LocalDate today) {
    WeeklyGoal goal = weeklyGoalRepository.findById(userId).orElse(null);
    if (goal == null) return Optional.empty();
    WeekWindow week = WeekWindow.containing(today);
    PeriodTotals totals = weeklyGoalRepository.sumBetween(userId, week.from(), week.to());
    long current = goal.getGoalType() == WeeklyGoalType.DISTANCE ? totals.getDistanceM() : totals.getRuns();
    long remaining = goal.getTargetValue() - current;
    return remaining > 0 ? Optional.of(new Remaining(goal.getGoalType(), remaining)) : Optional.empty();
  }

  private LocalDate todayFor(UUID userId, Instant now) {
    ZoneId zone = safeZone(weeklyGoalRepository.findUserTimeZone(userId).orElse(null));
    return now.atZone(zone).toLocalDate();
  }

  /** 오늘 또는 어제 운동했으면 그 날까지의 연속일, 아니면 0(이미 끊긴 연속은 보여주지 않는다). */
  static int currentStreak(LatestStreak streak, LocalDate today) {
    if (streak == null || streak.getLastDate() == null) return 0;
    if (streak.getLastDate().isBefore(today.minusDays(1))) return 0;
    return streak.getStreak();
  }

  private static ZoneId safeZone(String timeZone) {
    try {
      return timeZone == null ? KstTime.ZONE : ZoneId.of(timeZone);
    } catch (DateTimeException ignored) {
      return KstTime.ZONE;
    }
  }
}
