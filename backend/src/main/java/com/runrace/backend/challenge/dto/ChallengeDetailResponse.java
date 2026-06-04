package com.runrace.backend.challenge.dto;

import java.util.List;
import java.util.UUID;

public record ChallengeDetailResponse(
    Long id,
    String title,
    int goalKm,
    int maxMembers,
    String startAt,
    String endAt,
    UUID creatorUserId,
    UUID currentUserId,
    boolean isMember,
    boolean isOwner,
    boolean hasStarted,
    boolean hasEnded,
    boolean showManage,
    boolean canJoin,
    int memberCount,
    WinnerRow winner,
    List<MemberRow> members) {}
