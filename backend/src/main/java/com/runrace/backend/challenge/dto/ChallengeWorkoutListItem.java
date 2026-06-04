package com.runrace.backend.challenge.dto;

import java.util.UUID;

public record ChallengeWorkoutListItem(
    long workoutId,
    UUID userId,
    String nickname,
    String startedAt,
    String endedAt,
    int durationSec,
    int distanceM,
    int appliedDistanceM) {}
