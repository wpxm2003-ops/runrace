package com.runrace.backend.crew.dto;

import java.util.List;

/** 지난주(월요일 시작 주) 크루 결산 응답. */
public record CrewRecapResponse(
    String weekStartDate,
    String weekEndDate,
    long totalDistanceM,
    int totalRuns,
    int participantCount,
    String mvpNickname,
    long mvpDistanceM,
    List<CrewRecapLeader> leaders) {

  public record CrewRecapLeader(
      int rank,
      String nickname,
      long distanceM) {}
}
