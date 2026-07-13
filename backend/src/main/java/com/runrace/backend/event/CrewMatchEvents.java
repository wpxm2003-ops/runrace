package com.runrace.backend.event;

import java.util.List;
import java.util.UUID;

/** 크루 대항전 도메인에서 커밋 후 발생하는 이벤트(푸시 발송용). */
public final class CrewMatchEvents {
  private CrewMatchEvents() {}

  /** 도전장 도착 — 상대 크루 리더에게 푸시한다. */
  public record ChallengeReceived(UUID opponentLeaderId, String challengerCrewName, long matchId) {}

  /**
   * 대결 성사(수락) — 양측 로스터 전원에게 출전 푸시를 보낸다(수락 처리한 리더 제외).
   * opponentCrewName은 수신자 관점의 상대 크루명.
   */
  public record MatchConfirmed(List<RosterPush> receivers, long matchId) {
    public record RosterPush(UUID userId, String opponentCrewName) {}
  }

  /**
   * 대결 종료 확정 — 양측 로스터 전원에게 결과 푸시를 보낸다.
   * opponentCrewName은 수신자 관점의 상대 크루명, result는 수신자 크루 관점 WIN|LOSS|DRAW.
   */
  public record MatchEnded(long matchId, List<RosterResult> receivers) {
    public record RosterResult(UUID userId, String opponentCrewName, String result) {}
  }

  /**
   * 진행 중 추월 — 워크아웃 저장 직후 우리 크루가 상대를 앞질렀으면 추월당한 쪽 로스터 전원에게 푸시한다.
   * overtakerCrewName은 (추월당한) 수신자 관점의 상대(추월한) 크루명.
   */
  public record MatchOvertake(long matchId, String overtakerCrewName, List<UUID> overtakenUserIds) {}

  /** 도전장 거절 — 도전 크루 리더에게 알린다. */
  public record ChallengeDeclined(UUID challengerLeaderId, String opponentCrewName, long matchId) {}
}
