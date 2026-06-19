package com.runrace.backend.workout.repository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface WorkoutSessionRepositoryCustom {

  List<WorkoutComparisonItem> findRecentForComparison(
      UUID userId, Long excludeId, OffsetDateTime from);

  Optional<WorkoutComparisonItem> findPreviousForComparison(
      UUID userId, Long excludeId, OffsetDateTime before);
}
