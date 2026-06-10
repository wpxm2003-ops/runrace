package com.runrace.backend.workout;

import com.runrace.backend.push.PushService;
import com.runrace.backend.upload.ImageUploadService;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/** 운동 도메인 이벤트 리스너 (푸시 알림 + 리소스 정리). */
@Component
@RequiredArgsConstructor
public class WorkoutNotifications {

  private static final Logger log = LoggerFactory.getLogger(WorkoutNotifications.class);

  private final PushService pushService;
  private final ImageUploadService imageUploadService;

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void onIndoorRunPendingApproval(WorkoutEvents.IndoorRunPendingApprovalEvent event) {
    String name = event.submitterNickname() != null ? event.submitterNickname() : "";
    for (java.util.UUID voterId : event.voterUserIds()) {
      pushService.sendLocalized(
          voterId, "workout.approval_request.title", "workout.approval_request.body", name);
    }
  }

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void onIndoorRunApproved(WorkoutEvents.IndoorRunApprovedEvent event) {
    pushService.sendLocalized(
        event.submitterUserId(), "workout.approved.title", "workout.approved.body", null);
  }

  /**
   * 운동 삭제 후 S3 이미지 정리.
   * DB 커밋 이후 처리하여 트랜잭션 내 네트워크 I/O를 방지한다.
   */
  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void onWorkoutImageDeleted(WorkoutEvents.WorkoutImageDeletedEvent event) {
    try {
      imageUploadService.delete(event.imageUrl());
    } catch (Exception e) {
      log.warn("운동 이미지 S3 삭제 실패 (url={}): {}", event.imageUrl(), e.getMessage());
    }
  }
}
