package com.runrace.backend.notification;

import com.runrace.backend.event.NudgeEvents;
import com.runrace.backend.push.service.PushService;
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
        event.receiverUserId(), event.titleKey(), event.bodyKey(), event.senderNickname());
  }
}
