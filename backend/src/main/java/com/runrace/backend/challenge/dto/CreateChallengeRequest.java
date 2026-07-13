package com.runrace.backend.challenge.dto;

import java.math.BigDecimal;

public record CreateChallengeRequest(
    String title,
    BigDecimal goalKm,
    int maxMembers,
    String startAt,
    String endAt,
    String langCd,
    String stake,
    /** true면 생성자의 소속 크루 내부 레이스(멤버 전용·공개 목록 제외). null/false면 일반 레이스. */
    Boolean crewOnly) {}
