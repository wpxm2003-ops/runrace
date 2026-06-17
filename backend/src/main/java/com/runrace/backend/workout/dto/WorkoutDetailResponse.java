package com.runrace.backend.workout.dto;

import com.runrace.backend.common.IsoTime;
import com.runrace.backend.workout.domain.WorkoutSession;
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
    String imageUrl) {

  public static WorkoutDetailResponse from(WorkoutSession session, List<PathPointDto> path) {
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
        session.getImageUrl());
  }
}
