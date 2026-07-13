package com.runrace.backend.crew.dto;

import java.util.List;

/** 크루 홈 대항전 섹션 — 전적 + 진행/대기 중 매치 + 최근 결과. */
public record MyCrewMatchesResponse(
    MatchRecord record,
    /** 진행·시작대기 중인 대결(크루당 1개). 없으면 null. */
    CrewMatchSummary current,
    /** 내 크루가 받은 살아있는 도전장들. */
    List<CrewMatchSummary> pendingReceived,
    /** 내 크루가 보낸 살아있는 도전장들. */
    List<CrewMatchSummary> pendingSent,
    /** 최근 종료 대결 1건. 없으면 null. */
    CrewMatchSummary lastEnded) {

  public record MatchRecord(long wins, long losses, long draws) {}
}
