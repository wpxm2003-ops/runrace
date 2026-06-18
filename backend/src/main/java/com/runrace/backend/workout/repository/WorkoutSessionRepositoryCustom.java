package com.runrace.backend.workout.repository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public interface WorkoutSessionRepositoryCustom {

  List<WorkoutComparisonItem> findRecentForComparison(
      UUID userId, Long excludeId, OffsetDateTime from);
}
