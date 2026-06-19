package com.runrace.backend.workout.repository;

import com.querydsl.core.types.Projections;
import com.querydsl.jpa.impl.JPAQueryFactory;
import com.runrace.backend.workout.domain.QWorkoutSession;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;

@RequiredArgsConstructor
public class WorkoutSessionRepositoryImpl implements WorkoutSessionRepositoryCustom {

  private static final QWorkoutSession ws = QWorkoutSession.workoutSession;

  private final JPAQueryFactory query;

  @Override
  public List<WorkoutComparisonItem> findRecentForComparison(
      UUID userId, Long excludeId, OffsetDateTime from) {

    return query
        .select(Projections.constructor(
            WorkoutComparisonItem.class,
            ws.distanceM,
            ws.durationSec,
            ws.avgPaceSecPerKm))
        .from(ws)
        .where(
            ws.user.id.eq(userId),
            ws.id.ne(excludeId),
            ws.startedAt.goe(from))
        .orderBy(ws.startedAt.desc())
        .fetch();
  }

  @Override
  public Optional<WorkoutComparisonItem> findPreviousForComparison(
      UUID userId, Long excludeId, OffsetDateTime before) {

    WorkoutComparisonItem result = query
        .select(Projections.constructor(
            WorkoutComparisonItem.class,
            ws.distanceM,
            ws.durationSec,
            ws.avgPaceSecPerKm))
        .from(ws)
        .where(
            ws.user.id.eq(userId),
            ws.id.ne(excludeId),
            ws.startedAt.lt(before))
        .orderBy(ws.startedAt.desc())
        .limit(1)
        .fetchOne();

    return Optional.ofNullable(result);
  }
}
