package com.runrace.backend.challenge.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public record ChallengeDetailResponse(
    Long id,
    String title,
    BigDecimal goalKm,
    int maxMembers,
    String startAt,
    String endAt,
    String stake,
    /** 크루 내부 레이스면 크루명(뱃지 표시용). 일반 레이스·크루 해체 시 null. */
    String crewName,
    UUID creatorUserId,
    UUID currentUserId,
    boolean isMember,
    boolean isOwner,
    boolean hasStarted,
    boolean hasEnded,
    boolean showManage,
    boolean canJoin,
    boolean canLeave,
    int memberCount,
    WinnerRow winner,
    List<MemberRow> members) {}
