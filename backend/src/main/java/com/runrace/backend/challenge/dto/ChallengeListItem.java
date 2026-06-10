package com.runrace.backend.challenge.dto;

import java.math.BigDecimal;

public record ChallengeListItem(
    Long id,
    String title,
    BigDecimal goalKm,
    String phase,
    String startAt,
    String endAt,
    int memberCount,
    String createdAt,
    boolean isOwner,
    boolean isMember) {}
