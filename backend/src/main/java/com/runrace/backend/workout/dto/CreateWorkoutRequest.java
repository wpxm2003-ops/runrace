package com.runrace.backend.workout.dto;

import java.util.List;
import java.util.Map;
import java.util.UUID;

public record CreateWorkoutRequest(
    UUID clientWorkoutId,
    String startedAt,
    String endedAt,
    int durationSec,
    int distanceM,
    int calories,
    Integer avgPaceSecPerKm,
    List<PathPointDto> path,
    Map<String, Integer> bestSegments,
    Long ghostWorkoutId,
    GhostRaceResultDto ghostResult) {}
