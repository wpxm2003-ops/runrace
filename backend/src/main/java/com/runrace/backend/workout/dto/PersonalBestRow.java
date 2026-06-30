package com.runrace.backend.workout.dto;

/**
 * 내 개인 기록 한 줄 — NSM 페이스 자동 입력 등에 사용.
 * 레이스 환산 시간 = bestPaceSec × (distanceM / 1000).
 */
public record PersonalBestRow(
    String distanceKey,
    int bestPaceSec,
    int distanceM,
    String achievedAt) {}
