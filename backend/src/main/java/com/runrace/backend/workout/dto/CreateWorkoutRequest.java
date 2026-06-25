package com.runrace.backend.workout.dto;

import java.util.List;
import java.util.Map;

public record CreateWorkoutRequest(
    String startedAt,
    String endedAt,
    int durationSec,
    int distanceM,
    int calories,
    Integer avgPaceSecPerKm,
    List<PathPointDto> path,
    Map<String, Integer> bestSegments) {}
