package com.runrace.backend.workout.dto;

public record WorkoutSummaryResponse(
    long totalDistanceM,
    long totalDurationSec,
    int totalCalories,
    int workoutCount,
    int workoutDayCount,
    Integer avgPaceSecPerKm,
    int maxStreakDays) {}
