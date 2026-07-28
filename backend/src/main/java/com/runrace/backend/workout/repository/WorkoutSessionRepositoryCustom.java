package com.runrace.backend.workout.repository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface WorkoutSessionRepositoryCustom {

  /**
   * 비교 기준이 되는 운동 직전 구간 [from, before)의 기록들.
   * before(= 기준 운동의 시작 시각) 상한이 없으면 과거 운동 상세를 열었을 때
   * 그 이후에 기록한 운동까지 "최근 평균"에 섞인다.
   */
  List<WorkoutComparisonItem> findRecentForComparison(
      UUID userId, Long excludeId, OffsetDateTime from, OffsetDateTime before);

  Optional<WorkoutComparisonItem> findPreviousForComparison(
      UUID userId, Long excludeId, OffsetDateTime before);
}
