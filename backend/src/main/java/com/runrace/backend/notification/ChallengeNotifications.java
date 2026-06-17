package com.runrace.backend.notification;

import com.runrace.backend.event.ChallengeEndedEvent;
import com.runrace.backend.event.ChallengeEndedNoParticipantsEvent;
import com.runrace.backend.event.MilestoneReachedEvent;
import com.runrace.backend.event.RankOvertakeEvent;
import com.runrace.backend.push.service.PushService;
import java.util.concurrent.ThreadLocalRandom;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * 레이스 도메인의 푸시 알림을 처리한다.
 *
 * <p>트랜잭션 커밋 이후에만 동작하므로, 롤백된 레이스에 대해 알림이 나가지 않는다.
 * 외부 푸시(FCM)를 DB 트랜잭션으로 감싸지 않도록 리스너 자체에는 트랜잭션을 두지 않는다
 * (필요한 읽기는 각 리포지토리 호출이 자체 트랜잭션으로 처리).
 */
@Component
@RequiredArgsConstructor
public class ChallengeNotifications {
  private final PushService pushService;

  /** 풀별 변형 개수(messages*.properties의 challenge.milestone50.0~9 등과 일치). */
  private static final int VARIANTS = 10;

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void onMilestoneReached(MilestoneReachedEvent event) {
    // 변형은 이벤트당 한 번만 골라(=모두 같은 문구) 각 수신자의 언어로 렌더링한다.
    String bodyKey = "challenge.milestone50." + ThreadLocalRandom.current().nextInt(VARIANTS);
    event.otherMemberIds().forEach(userId ->
        pushService.sendLocalized(userId, "challenge.race_title", bodyKey, event.achieverNickname()));
  }

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void onChallengeEndedNoParticipants(ChallengeEndedNoParticipantsEvent event) {
    pushService.sendLocalized(
        event.creatorUserId(),
        "challenge.ended_no_member.title",
        "challenge.ended_no_member.body",
        null);
  }

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void onChallengeEnded(ChallengeEndedEvent event) {
    String bodyKey =
        event.winnerNickname() != null ? "challenge.ended.body" : "challenge.ended.body_no_winner";
    event.memberIds().forEach(userId ->
        pushService.sendLocalized(userId, "challenge.race_title", bodyKey, event.winnerNickname()));
  }

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void onRankOvertake(RankOvertakeEvent event) {
    String bodyKey = "challenge.overtake." + ThreadLocalRandom.current().nextInt(VARIANTS);
    event.overtakenUserIds().forEach(userId ->
        pushService.sendLocalized(userId, "challenge.race_title", bodyKey, event.overtakerNickname()));
  }
}
