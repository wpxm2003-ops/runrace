package com.runrace.backend.challenge.dto;

import com.runrace.backend.challenge.domain.PrizeAwardType;

public record PrizeResultResponse(
    PrizeAwardType awardType,
    String status,
    Integer prizeRank,
    String prizeName,
    boolean hasImage) {}
