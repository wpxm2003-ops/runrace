package com.runrace.backend.workout;

import com.runrace.backend.push.PushService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/** 운동 도메인 푸시 알림 리스너. */
@Component
@RequiredArgsConstructor
public class WorkoutNotifications {

  private final PushService pushService;

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
}
