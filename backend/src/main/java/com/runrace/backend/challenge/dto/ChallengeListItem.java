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
    boolean isMember,
    /** 경품이 하나라도 등록됐는지 — 목록 뱃지용(경품명·이미지는 미노출). */
    boolean hasPrize) {}
