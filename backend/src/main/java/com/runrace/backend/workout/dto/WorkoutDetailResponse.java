package com.runrace.backend.workout.dto;

import com.runrace.backend.common.IsoTime;
import com.runrace.backend.workout.domain.WorkoutSession;
import com.runrace.backend.workout.elevation.ElevationSource;
import java.util.List;

public record WorkoutDetailResponse(
    Long id,
    String startedAt,
    String endedAt,
    int durationSec,
    int distanceM,
    int calories,
    Integer avgPaceSecPerKm,
    List<PathPointDto> path,
    String workoutType,
    String imageUrl,
    String memo,
    Long shoeId,
    String shoeName,
    /** 고도 출처 — DEM일 때만 클라이언트가 고도를 표시한다. */
    String elevationSource) {

  public static WorkoutDetailResponse from(
      WorkoutSession session, List<PathPointDto> path, ElevationSource elevationSource) {
    var shoe = session.getShoe();
    return new WorkoutDetailResponse(
        session.getId(),
        IsoTime.format(session.getStartedAt()),
        IsoTime.format(session.getEndedAt()),
        session.getDurationSec(),
        session.getDistanceM(),
        session.getCalories(),
        session.getAvgPaceSecPerKm(),
        path,
        session.getWorkoutType().name(),
        session.getImageUrl(),
        session.getMemo(),
        shoe != null ? shoe.getId() : null,
        shoe != null ? shoe.displayName() : null,
        elevationSource.name());
  }
}
