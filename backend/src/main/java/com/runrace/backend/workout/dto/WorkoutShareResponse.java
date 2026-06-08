package com.runrace.backend.workout.dto;

import java.util.List;

/** 공개 운동 공유 페이지용 — 인증 없이 조회 가능, 사용자 식별 정보 미포함. */
public record WorkoutShareResponse(
    int durationSec,
    int distanceM,
    int calories,
    Integer avgPaceSecPerKm,
    String startedAt,
    List<PathPointDto> path) {}
