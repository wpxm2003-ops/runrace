package com.runrace.backend.challenge;

import com.runrace.backend.analytics.AnalyticsService;
import com.runrace.backend.push.PushService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * 대결 도메인의 부가 효과(분석·푸시)를 처리한다.
 *
 * <p>트랜잭션 커밋 이후에만 동작하므로, 롤백된 대결에 대해 알림이 나가지 않는다.
 * 새 트랜잭션({@code REQUIRES_NEW})에서 멤버를 다시 조회한다.
 */
@Component
@RequiredArgsConstructor
public class ChallengeNotifications {
  private final ChallengeMemberRepository challengeMemberRepository;
  private final PushService pushService;
  private final AnalyticsService analyticsService;

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public void onChallengeCreated(ChallengeCreatedEvent event) {
    analyticsService.track(
        event.creatorUserId(), "challenge.created", "{\"challengeId\":" + event.challengeId() + "}");

    challengeMemberRepository.findAllForChallenge(event.challengeId()).stream()
        .map(member -> member.getUser().getId())
        .filter(userId -> !userId.equals(event.creatorUserId()))
        .forEach(userId -> pushService.sendToUserTokens(userId, "RunRace", "새 대결이 생성됐어요."));
  }
}
