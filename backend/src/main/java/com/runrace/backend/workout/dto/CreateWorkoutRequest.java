package com.runrace.backend.workout.dto;

import java.util.List;
import java.util.Map;
import java.util.UUID;

public record CreateWorkoutRequest(
    UUID clientWorkoutId,
    String startedAt,
    /** 시작 시각의 기기 벽시계 "YYYY-MM-DDTHH:mm:ss"(타임존 없음). 구클라이언트는 null. */
    String startedAtLocal,
    String endedAt,
    int durationSec,
    int distanceM,
    int calories,
    Integer avgPaceSecPerKm,
    List<PathPointDto> path,
    Map<String, Integer> bestSegments,
    Long ghostWorkoutId,
    GhostRaceResultDto ghostResult) {}
