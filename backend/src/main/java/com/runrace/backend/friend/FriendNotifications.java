package com.runrace.backend.friend;

import com.runrace.backend.push.PushService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/** 친구 넛지 푸시를 커밋 후 처리한다. */
@Component
@RequiredArgsConstructor
public class FriendNotifications {
  private final PushService pushService;

  /** 넛지 푸시 — body는 사용자 입력이라 번역하지 않는다. */
  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void onNudgeSent(FriendEvents.NudgeSent event) {
    pushService.sendLocalizedRawBody(
        event.receiverUserId(), "friend.nudge.title", event.senderNickname(), event.message());
  }
}
