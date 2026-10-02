package com.runrace.backend.workout.service;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.common.ApiException;
import com.runrace.backend.workout.domain.WorkoutSession;
import com.runrace.backend.workout.dto.PreviousWorkoutDto;
import com.runrace.backend.workout.dto.WorkoutComparisonResponse;
import com.runrace.backend.workout.dto.WorkoutSummaryResponse;
import com.runrace.backend.workout.repository.WorkoutComparisonItem;
import com.runrace.backend.workout.repository.WorkoutSessionRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 운동 상세·요약·달력·비교 조회를 전담한다. */
@Service
@RequiredArgsConstructor
public class WorkoutQueryService {
  private static final int COMPARISON_LOOKBACK_DAYS = 30;

  private final WorkoutSessionRepository workoutSessionRepository;

  @Transactional(readOnly = true)
  public WorkoutSession getForUser(UUID userId, Long id) {
    return workoutSessionRepository
        .findDetailByIdAndUserId(id, userId)
        .orElseThrow(() -> ApiException.notFound("workout_not_found"));
  }

  @Transactional(readOnly = true)
  public WorkoutSession getForShare(Long id) {
    return workoutSessionRepository
        .findById(id)
        .orElseThrow(() -> ApiException.notFound("workout_not_found"));
  }

  @Transactional(readOnly = true)
  public WorkoutSummaryResponse summaryForUser(UUID userId) {
    WorkoutSessionRepository.WorkoutSummaryAggregate aggregate =
        workoutSessionRepository.aggregateForUser(userId);
    long totalDistanceM = aggregate.getTotalDistanceM();
    long totalDurationSec = aggregate.getTotalDurationSec();

    return new WorkoutSummaryResponse(
        totalDistanceM,
        totalDurationSec,
        (int) aggregate.getTotalCalories(),
        (int) aggregate.getWorkoutCount(),
        (int) aggregate.getWorkoutDayCount(),
        WorkoutService.avgPaceSecPerKm(totalDistanceM, totalDurationSec),
        workoutSessionRepository.maxStreakDaysForUser(userId));
  }

  /** 기록 달력 연도 경계는 기기 현지 날짜(started_at_local)를 따른다. */
  @Transactional(readOnly = true)
  public List<WorkoutSessionRepository.WorkoutListView> listForUserInYear(UUID userId, int year) {
    LocalDateTime from = LocalDate.of(year, 1, 1).atStartOfDay();
    LocalDateTime to = LocalDate.of(year + 1, 1, 1).atStartOfDay();
    return workoutSessionRepository
        .findListByUserIdAndStartedAtLocalGreaterThanEqualAndStartedAtLocalLessThanOrderByStartedAtLocalDesc(
            userId, from, to);
  }

  /** 최근 30일 평균 비교와 직전 기록을 반환한다. */
  @Transactional(readOnly = true)
  public WorkoutComparisonResponse getComparison(AuthPrincipal principal, Long id) {
    WorkoutSession current = getForUser(principal.userId(), id);
    OffsetDateTime from = current.getStartedAt().minusDays(COMPARISON_LOOKBACK_DAYS);
    List<WorkoutComparisonItem> recent = workoutSessionRepository.findRecentForComparison(
        principal.userId(), id, from, current.getStartedAt());
    PreviousWorkoutDto previous = findPreviousWorkout(
        principal.userId(), id, current.getStartedAt());
    if (recent.isEmpty()) return WorkoutComparisonResponse.builder().previous(previous).build();
    return averageComparison(recent, previous);
  }

  private PreviousWorkoutDto findPreviousWorkout(UUID userId, Long id, OffsetDateTime before) {
    return workoutSessionRepository
        .findPreviousForComparison(userId, id, before)
        .map(workout -> new PreviousWorkoutDto(
            workout.distanceM(), workout.durationSec(), workout.avgPaceSecPerKm()))
        .orElse(null);
  }

  private WorkoutComparisonResponse averageComparison(
      List<WorkoutComparisonItem> recent, PreviousWorkoutDto previous) {
    long totalDistance = 0;
    long totalDuration = 0;
    long paceSum = 0;
    int paceCount = 0;
    for (WorkoutComparisonItem workout : recent) {
      totalDistance += workout.distanceM();
      totalDuration += workout.durationSec();
      if (workout.avgPaceSecPerKm() != null) {
        paceSum += workout.avgPaceSecPerKm();
        paceCount++;
      }
    }

    return WorkoutComparisonResponse.builder()
        .recentCount(recent.size())
        .avgDistanceM((int) (totalDistance / recent.size()))
        .avgDurationSec((int) (totalDuration / recent.size()))
        .avgPaceSec(paceCount > 0 ? (int) (paceSum / paceCount) : null)
        .previous(previous)
        .build();
  }
}
