package com.runrace.backend.workout.repository;

import com.runrace.backend.workout.domain.WorkoutType;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public interface WorkoutSessionRepositoryCustom {

  List<WorkoutComparisonItem> findRecentForComparison(
      UUID userId, WorkoutType workoutType, Long excludeId, OffsetDateTime from);
}
