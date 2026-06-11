package com.runrace.backend.nudge;

import com.runrace.backend.push.PushService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/** 콕 찌르기 푸시를 커밋 후 처리한다. */
@Component
@RequiredArgsConstructor
public class NudgeNotifications {
  private final PushService pushService;

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void onNudgeSent(NudgeEvents.NudgeSent event) {
    pushService.sendLocalized(
        event.receiverUserId(), "nudge.title", event.bodyKey(), event.senderNickname());
  }
}
