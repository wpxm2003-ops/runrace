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
}
