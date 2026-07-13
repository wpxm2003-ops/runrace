package com.runrace.backend.crew.dto;

/**
 * 지난주(월~일 완결 주) 크루 결산 — 결산 카드·홈 결산 섹션용.
 * 기록이 없던 주면 totalRuns=0, mvpNickname=null.
 */
public record CrewRecapResponse(
    String weekStartDate,
    String weekEndDate,
    long totalDistanceM,
    int totalRuns,
    long perCapitaDistanceM,
    String mvpNickname,
    long mvpDistanceM) {}
