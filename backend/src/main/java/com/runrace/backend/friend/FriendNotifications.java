package com.runrace.backend.friend;

import com.runrace.backend.analytics.AnalyticsService;
import com.runrace.backend.push.PushService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/** 친구 초대 생성·수락에 따른 분석 기록과 푸시 알림을 커밋 후 처리한다. */
@Component
@RequiredArgsConstructor
public class FriendNotifications {
  private final AnalyticsService analyticsService;
  private final PushService pushService;

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void onInviteCreated(FriendEvents.InviteCreated event) {
    // MVP: 초대 생성 시점엔 상대를 특정할 수 없어 푸시는 링크 공유로 대체한다.
    analyticsService.track(
        event.inviterUserId(), "friend_invite.created", "{\"code\":\"" + event.code() + "\"}");
  }

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void onInviteAccepted(FriendEvents.InviteAccepted event) {
    analyticsService.track(
        event.accepterUserId(), "friend_invite.accepted", "{\"code\":\"" + event.code() + "\"}");
    pushService.sendLocalized(
        event.inviterUserId(), "common.brand", "friend.invite_accepted.body", null);
  }

  /** 넛지 푸시 — DB 작업이 없으므로 트랜잭션 없이 커밋 후 전송한다. body는 사용자 입력이라 번역하지 않는다. */
  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void onNudgeSent(FriendEvents.NudgeSent event) {
    pushService.sendLocalizedRawBody(
        event.receiverUserId(), "friend.nudge.title", event.senderNickname(), event.message());
  }
}
