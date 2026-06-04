package com.runrace.backend.workout.dto;

import java.util.List;

public record CreateWorkoutRequest(
    String startedAt,
    String endedAt,
    int durationSec,
    int distanceM,
    int calories,
    Integer avgPaceSecPerKm,
    List<PathPointDto> path) {}
