package com.runrace.backend.crew.dto;

import java.util.List;
import java.util.UUID;

/**
 * 대항전 상세 — 양 크루 점수 + 로스터별 기여(거리 내림차순). 참가 크루 멤버만 조회 가능.
 * status·result 의미는 {@link CrewMatchSummary}와 동일(+ DECLINED/EXPIRED 포함).
 */
public record CrewMatchDetailResponse(
    long id,
    String status,
    String challengerCrewName,
    String opponentCrewName,
    boolean myCrewIsChallenger,
    int rosterSize,
    int durationDays,
    String createdAt,
    String startAt,
    String endAt,
    boolean canAccept,
    boolean canDecline,
    boolean canCancel,
    long challengerDistanceM,
    long opponentDistanceM,
    String result,
    List<RosterRow> challengerRoster,
    List<RosterRow> opponentRoster) {

  public record RosterRow(UUID userId, String nickname, boolean isMe, long distanceM) {}
}
