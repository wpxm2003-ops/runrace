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
    String name = event.submitterNickname() != null ? event.submitterNickname() : "멤버";
    String title = "실내러닝 승인 요청";
    String body = name + " 님의 러닝머신 기록을 확인해 주세요.";
    for (java.util.UUID voterId : event.voterUserIds()) {
      pushService.sendToUserTokens(voterId, title, body);
    }
  }

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void onIndoorRunApproved(WorkoutEvents.IndoorRunApprovedEvent event) {
    pushService.sendToUserTokens(
        event.submitterUserId(),
        "실내러닝 승인 완료 ✅",
        "모든 구성원이 승인했어요. 레이스 거리에 반영됐습니다.");
  }
}
