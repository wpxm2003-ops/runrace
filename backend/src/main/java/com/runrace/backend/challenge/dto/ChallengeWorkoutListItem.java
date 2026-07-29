package com.runrace.backend.challenge.dto;

import java.util.UUID;

/**
 * workoutId는 의도적으로 포함하지 않는다 — 인증 없는 공개 목록이라, GPS 전체를 반환하는
 * 공개 공유 엔드포인트(GET /api/workouts/{id}/share)의 키를 닉네임과 함께 쥐여주면
 * "누구 것인지 아는 GPS 조회"로 바로 이어진다.
 */
public record ChallengeWorkoutListItem(
    UUID userId,
    String nickname,
    String startedAt,
    String endedAt,
    int durationSec,
    int distanceM,
    int appliedDistanceM) {}
