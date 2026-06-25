package com.runrace.backend.event;

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

  /**
   * 실외 운동 저장 완료 — 라이벌 도발 푸시 발송용.
   * userId를 라이벌로 등록한 모든 사용자에게 AFTER_COMMIT으로 발송한다.
   */
  public record WorkoutSavedEvent(UUID userId, String nickname, int distanceM) {}

  /**
   * 운동 삭제 시 S3 이미지 정리용 이벤트.
   * AFTER_COMMIT 리스너에서 처리하여 트랜잭션 내 네트워크 I/O(커넥션 점유)를 방지한다.
   */
  public record WorkoutImageDeletedEvent(String imageUrl) {}
}
