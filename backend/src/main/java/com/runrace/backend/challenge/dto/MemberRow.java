package com.runrace.backend.challenge.dto;

import java.math.BigDecimal;
import java.util.UUID;

public record MemberRow(
    UUID userId,
    String displayName,
    String photoUrl,
    BigDecimal totalKm,
    BigDecimal remainingKm,
    BigDecimal progressPercent,
    boolean finished) {}
