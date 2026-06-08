package com.runrace.backend.workout.dto;

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
    String imageUrl) {}
