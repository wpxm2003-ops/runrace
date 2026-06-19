package com.runrace.backend.workout.dto;

import lombok.Builder;

@Builder
public record WorkoutComparisonResponse(
    int recentCount,
    Integer avgPaceSec,
    int avgDistanceM,
    int avgDurationSec,
    PreviousWorkoutDto previous
) {}
