package com.runrace.backend.crew.dto;

/**
 * 대항전 요약(크루 홈 카드용). status는 파생 상태:
 * PENDING(수락 대기) | SCHEDULED(시작 대기) | IN_PROGRESS | ENDED.
 * result는 내 크루 관점 — WIN | LOSS | DRAW | null(미종료).
 */
public record CrewMatchSummary(
    long id,
    String status,
    String challengerCrewName,
    String opponentCrewName,
    boolean myCrewIsChallenger,
    int rosterSize,
    String startAt,
    String endAt,
    long myCrewDistanceM,
    long opponentCrewDistanceM,
    String result) {}
