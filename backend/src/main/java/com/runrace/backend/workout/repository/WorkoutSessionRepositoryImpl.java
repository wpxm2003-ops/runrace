package com.runrace.backend.workout.repository;

import com.querydsl.core.types.Projections;
import com.querydsl.jpa.impl.JPAQueryFactory;
import com.runrace.backend.workout.domain.QWorkoutSession;
import com.runrace.backend.workout.domain.WorkoutType;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;

@RequiredArgsConstructor
public class WorkoutSessionRepositoryImpl implements WorkoutSessionRepositoryCustom {

  private static final QWorkoutSession ws = QWorkoutSession.workoutSession;

  private final JPAQueryFactory query;

  @Override
  public List<WorkoutComparisonItem> findRecentForComparison(
      UUID userId, WorkoutType workoutType, Long excludeId, OffsetDateTime from) {

    return query
        .select(Projections.constructor(
            WorkoutComparisonItem.class,
            ws.distanceM,
            ws.durationSec,
            ws.avgPaceSecPerKm))
        .from(ws)
        .where(
            ws.user.id.eq(userId),
            ws.workoutType.eq(workoutType),
            ws.id.ne(excludeId),
            ws.startedAt.goe(from))
        .orderBy(ws.startedAt.desc())
        .fetch();
  }
}
