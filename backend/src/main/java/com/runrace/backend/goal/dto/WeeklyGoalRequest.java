package com.runrace.backend.goal.dto;

/**
 * 주간 목표 저장 요청.
 *
 * @param type   DISTANCE 또는 RUNS
 * @param target DISTANCE면 미터(1km~300km), RUNS면 횟수(1~14)
 */
public record WeeklyGoalRequest(String type, Integer target) {}
