package com.runrace.backend.notification;

import com.runrace.backend.event.CrewMatchEvents;
import com.runrace.backend.push.service.PushService;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * 크루 대항전 푸시 — 도전장 도착(상대 리더) + 대결 성사(양측 로스터) + 진행 중 추월(추월당한 로스터)
 * + 대결 종료(양측 로스터) + 도전장 거절(도전 리더)를 커밋 후 처리한다.
 */
@Component
@RequiredArgsConstructor
public class CrewMatchNotifications {
  private final PushService pushService;

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void onChallengeReceived(CrewMatchEvents.ChallengeReceived event) {
    pushService.sendLocalized(
        event.opponentLeaderId(),
        "crew.match.challenge.title",
        "crew.match.challenge.body",
        event.challengerCrewName(),
        "/crew/match?id=" + event.matchId());
  }

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void onMatchConfirmed(CrewMatchEvents.MatchConfirmed event) {
    for (var receiver : event.receivers()) {
      pushService.sendLocalized(
          receiver.userId(),
          "crew.match.confirmed.title",
          "crew.match.confirmed.body",
          receiver.opponentCrewName(),
          "/crew/match?id=" + event.matchId());
    }
  }

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void onMatchEnded(CrewMatchEvents.MatchEnded event) {
    for (var receiver : event.receivers()) {
      String bodyKey = switch (receiver.result()) {
        case "WIN" -> "crew.match.ended.win";
        case "LOSS" -> "crew.match.ended.loss";
        default -> "crew.match.ended.draw";
      };
      pushService.sendLocalized(
          receiver.userId(),
          "crew.match.ended.title",
          bodyKey,
          receiver.opponentCrewName(),
          "/crew/match?id=" + event.matchId());
    }
  }

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void onMatchOvertake(CrewMatchEvents.MatchOvertake event) {
    for (UUID userId : event.overtakenUserIds()) {
      pushService.sendLocalized(
          userId,
          "crew.match.overtake.title",
          "crew.match.overtake.body",
          event.overtakerCrewName(),
          "/crew/match?id=" + event.matchId());
    }
  }

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void onChallengeDeclined(CrewMatchEvents.ChallengeDeclined event) {
    pushService.sendLocalized(
        event.challengerLeaderId(),
        "crew.match.declined.title",
        "crew.match.declined.body",
        event.opponentCrewName(),
        "/crew/match?id=" + event.matchId());
  }
}
