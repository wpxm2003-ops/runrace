package com.runrace.backend.workout.dto;

import com.runrace.backend.common.IsoTime;
import com.runrace.backend.workout.domain.WorkoutSession;
import java.time.temporal.ChronoUnit;
import java.util.List;

/** 공개 운동 공유 페이지용 — 인증 없이 조회 가능, 사용자 식별 정보 미포함. */
public record WorkoutShareResponse(
    int durationSec,
    int distanceM,
    int calories,
    Integer avgPaceSecPerKm,
    String startedAt,
    /**
     * 기기 벽시계 시작 시각(타임존 없음, 시간 단위 절삭). 상세 화면과 같은 날짜를 보여주기 위한 것 —
     * startedAt(UTC)만 쓰면 보는 사람의 타임존으로 변환돼 뛴 날짜와 하루 어긋날 수 있다.
     */
    String startedAtLocal,
    List<PathPointDto> path,
    String workoutType,
    String imageUrl) {

  public static WorkoutShareResponse from(WorkoutSession session, List<PathPointDto> path) {
    return new WorkoutShareResponse(
        session.getDurationSec(),
        session.getDistanceM(),
        session.getCalories(),
        session.getAvgPaceSecPerKm(),
        IsoTime.format(session.getStartedAt().truncatedTo(ChronoUnit.HOURS)),
        session.getStartedAtLocal().truncatedTo(ChronoUnit.HOURS).toString(),
        path,
        session.getWorkoutType().name(),
        session.getImageUrl());
  }
}
