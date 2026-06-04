package com.runrace.backend.challenge.dto;

public record ChallengeListItem(
    Long id,
    String title,
    int goalKm,
    String phase,
    String startAt,
    String endAt,
    int memberCount,
    String createdAt,
    boolean isOwner) {}
