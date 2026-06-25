package com.runrace.backend.shoe.dto;

/** 신발장 한 줄 — 누적 거리(totalDistanceM) 포함. */
public record ShoeRow(
    Long id,
    String brand,
    String model,
    String nickname,
    Integer targetDistanceM,
    boolean active,
    long totalDistanceM) {}
