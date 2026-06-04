package com.runrace.backend.fitness;

import com.runrace.backend.challenge.ChallengeMember;
import com.runrace.backend.challenge.ChallengeMemberRepository;
import com.runrace.backend.push.PushService;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/** 일일 거리가 대결에 반영되면 같은 대결의 다른 멤버에게 best-effort 푸시를 보낸다. */
@Component
@RequiredArgsConstructor
public class FitnessNotifications {
  private final ChallengeMemberRepository challengeMemberRepository;
  private final PushService pushService;

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public void onDailyDistanceSynced(DailyDistanceSyncedEvent event) {
    UUID actorId = event.userId();
    challengeMemberRepository.findAllActiveForUser(actorId, OffsetDateTime.now()).stream()
        .flatMap(my -> challengeMemberRepository.findAllForChallenge(my.getChallenge().getId()).stream())
        .map(ChallengeMember::getUser)
        .map(user -> user.getId())
        .filter(memberId -> !memberId.equals(actorId))
        .distinct()
        .forEach(memberId -> pushService.sendToUserTokens(memberId, "RunRace", "오늘 기록이 대결에 반영됐어요."));
  }
}
