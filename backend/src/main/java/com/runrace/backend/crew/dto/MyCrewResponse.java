package com.runrace.backend.crew.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/** 내 크루 홈 응답 — 미소속이면 {@code crew = null}. */
public record MyCrewResponse(CrewView crew) {

  /**
   * 크루 정보 + 주간 보드(멤버별 이번 주 거리·횟수, 거리 내림차순).
   * lastWeekSameTimeDistanceM: 지난주 같은 경과 시점까지의 크루 합계(요일 공정 비교).
   * allTimeDistanceM: 멤버별 가입 이후 운동 합산(함께 달린 누적).
   */
  public record CrewView(
      long id,
      String name,
      String notice,
      String joinCode,
      boolean isLeader,
      int maxMembers,
      BigDecimal weekGoalKm,
      long lastWeekSameTimeDistanceM,
      long allTimeDistanceM,
      List<CrewMemberRow> members) {}

  public record CrewMemberRow(
      UUID userId,
      String nickname,
      boolean isLeader,
      boolean isMe,
      long weekDistanceM,
      int weekRuns) {}
}
