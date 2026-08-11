package com.runrace.backend.workout.dto;

public record WorkoutListItem(
    Long id,
    String startedAt,
    /** 기기 벽시계 시작 시각(타임존 없음). 달력·잔디의 날짜 그루핑 기준. */
    String startedAtLocal,
    String endedAt,
    int durationSec,
    int distanceM,
    int calories,
    Integer avgPaceSecPerKm,
    String workoutType) {}
