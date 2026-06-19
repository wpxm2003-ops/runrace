package com.runrace.backend.workout.dto;

public record PreviousWorkoutDto(
    int distanceM,
    int durationSec,
    Integer avgPaceSecPerKm
) {}
