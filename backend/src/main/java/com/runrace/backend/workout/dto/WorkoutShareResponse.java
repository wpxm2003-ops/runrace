package com.runrace.backend.workout.dto;

import com.runrace.backend.common.IsoTime;
import com.runrace.backend.workout.WorkoutSession;
import java.util.List;

/** 공개 운동 공유 페이지용 — 인증 없이 조회 가능, 사용자 식별 정보 미포함. */
public record WorkoutShareResponse(
    int durationSec,
    int distanceM,
    int calories,
    Integer avgPaceSecPerKm,
    String startedAt,
    List<PathPointDto> path,
    String workoutType,
    String imageUrl) {

  public static WorkoutShareResponse from(WorkoutSession session, List<PathPointDto> path) {
    return new WorkoutShareResponse(
        session.getDurationSec(),
        session.getDistanceM(),
        session.getCalories(),
        session.getAvgPaceSecPerKm(),
        IsoTime.format(session.getStartedAt()),
        path,
        session.getWorkoutType().name(),
        session.getImageUrl());
  }
}
