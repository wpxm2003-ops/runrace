package com.runrace.backend.workout.dto;

import com.runrace.backend.common.IsoTime;
import com.runrace.backend.workout.domain.WorkoutSession;
import java.util.List;

public record WorkoutDetailResponse(
    Long id,
    String startedAt,
    /** 기기 벽시계 시작 시각(타임존 없음). 기록된 현지 시각 표시·날짜 그루핑 기준. */
    String startedAtLocal,
    String endedAt,
    int durationSec,
    int distanceM,
    int calories,
    Integer avgPaceSecPerKm,
    List<PathPointDto> path,
    String workoutType,
    String imageUrl,
    String memo,
    Long shoeId,
    String shoeName) {

  public static WorkoutDetailResponse from(WorkoutSession session, List<PathPointDto> path) {
    var shoe = session.getShoe();
    return new WorkoutDetailResponse(
        session.getId(),
        IsoTime.format(session.getStartedAt()),
        session.getStartedAtLocal().toString(),
        IsoTime.format(session.getEndedAt()),
        session.getDurationSec(),
        session.getDistanceM(),
        session.getCalories(),
        session.getAvgPaceSecPerKm(),
        path,
        session.getWorkoutType().name(),
        session.getImageUrl(),
        session.getMemo(),
        shoe != null ? shoe.getId() : null,
        shoe != null ? shoe.displayName() : null);
  }
}
