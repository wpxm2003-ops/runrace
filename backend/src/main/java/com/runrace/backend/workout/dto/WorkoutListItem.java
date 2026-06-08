package com.runrace.backend.workout.dto;

public record WorkoutListItem(
    Long id,
    String startedAt,
    String endedAt,
    int durationSec,
    int distanceM,
    int calories,
    Integer avgPaceSecPerKm,
    String workoutType) {}
