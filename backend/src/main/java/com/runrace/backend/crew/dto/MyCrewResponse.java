package com.runrace.backend.crew.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/** 내 크루 홈 응답 — 미소속이면 {@code crew = null}. */
public record MyCrewResponse(CrewView crew) {

  /**
   * 크루 정보 + 월간 보드(멤버별 이번 달 거리·횟수, 거리 내림차순).
   * allTimeDistanceM: 멤버별 가입 이후 운동 합산(함께 달린 누적).
   */
  public record CrewView(
      long id,
      String name,
      String notice,
      String joinCode,
      boolean isLeader,
      int maxMembers,
      BigDecimal monthGoalKm,
      long allTimeDistanceM,
      List<CrewMemberRow> members) {}

  public record CrewMemberRow(
      UUID userId,
      String nickname,
      boolean isLeader,
      boolean isMe,
      long monthDistanceM,
      int monthRuns) {}
}
