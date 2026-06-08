package com.runrace.backend.challenge.dto;

import java.util.List;

/** 레이스 상세 — 거부된 실내러닝 목록 항목. */
public record RejectedApprovalResponse(
    Long challengeWorkoutId,
    Long workoutId,
    String submitterNickname,
    int distanceM,
    int durationSec,
    String imageUrl,
    String startedAt,
    List<String> rejectorNicknames
) {}
