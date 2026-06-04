package com.runrace.backend.friend;

import com.runrace.backend.analytics.AnalyticsService;
import com.runrace.backend.push.PushService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/** 친구 초대 생성·수락에 따른 분석 기록과 푸시 알림을 커밋 후 처리한다. */
@Component
@RequiredArgsConstructor
public class FriendNotifications {
  private final AnalyticsService analyticsService;
  private final PushService pushService;

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public void onInviteCreated(FriendEvents.InviteCreated event) {
    // MVP: 초대 생성 시점엔 상대를 특정할 수 없어 푸시는 링크 공유로 대체한다.
    analyticsService.track(
        event.inviterUserId(), "friend_invite.created", "{\"code\":\"" + event.code() + "\"}");
  }

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public void onInviteAccepted(FriendEvents.InviteAccepted event) {
    analyticsService.track(
        event.accepterUserId(), "friend_invite.accepted", "{\"code\":\"" + event.code() + "\"}");
    pushService.sendToUserTokens(event.inviterUserId(), "RunRace", "친구 초대가 수락됐어요.");
  }
}
