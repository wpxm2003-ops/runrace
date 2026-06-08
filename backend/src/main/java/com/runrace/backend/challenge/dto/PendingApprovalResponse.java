package com.runrace.backend.challenge.dto;

/** 레이스 상세 — 승인 대기 중인 실내러닝 목록 항목. */
public record PendingApprovalResponse(
    Long challengeWorkoutId,
    Long workoutId,
    String submitterNickname,
    int distanceM,
    int durationSec,
    Integer avgPaceSecPerKm,
    String imageUrl,
    String startedAt,
    Boolean myVote,        // null=아직 미투표, true=승인, false=거부
    boolean canVote,       // 제출자는 false — 본인 기록에 승인/거부 불가
    int totalVoters,
    int approvedCount
) {}
