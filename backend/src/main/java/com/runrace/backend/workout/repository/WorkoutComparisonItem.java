package com.runrace.backend.workout.repository;

public record WorkoutComparisonItem(
    int distanceM,
    int durationSec,
    Integer avgPaceSecPerKm
) {}
