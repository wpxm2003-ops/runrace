package com.runrace.backend.workout;

import java.util.List;
import java.util.UUID;

/** 운동 도메인 Spring 이벤트 모음. */
public final class WorkoutEvents {
  private WorkoutEvents() {}

  /** 실내러닝 승인 요청 — 투표자들에게 푸시 발송용. */
  public record IndoorRunPendingApprovalEvent(
      long challengeWorkoutId,
      long challengeId,
      UUID submitterUserId,
      List<UUID> voterUserIds,
      String submitterNickname
  ) {}

  /** 실내러닝 전원 승인 완료 — 제출자에게 푸시 발송용. */
  public record IndoorRunApprovedEvent(
      long challengeWorkoutId,
      UUID submitterUserId
  ) {}
}
