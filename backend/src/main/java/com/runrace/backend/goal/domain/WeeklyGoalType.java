package com.runrace.backend.goal.domain;

/** 개인 주간 목표 종류. 목표값 단위는 종류마다 다르다(거리=미터, 횟수=회). */
public enum WeeklyGoalType {
  DISTANCE(1_000, 300_000),
  RUNS(1, 14);

  private final int minTarget;
  private final int maxTarget;

  WeeklyGoalType(int minTarget, int maxTarget) {
    this.minTarget = minTarget;
    this.maxTarget = maxTarget;
  }

  public boolean accepts(int target) {
    return target >= minTarget && target <= maxTarget;
  }

  /** 성과(Achievement.value2)로 내려 보내는 종류 코드 — 프론트가 문구 단위를 고를 때 쓴다. */
  public long achievementCode() {
    return this == DISTANCE ? 0L : 1L;
  }
}
