package com.runrace.backend.crew.dto;

import java.util.List;

/** 멤버 수 내림차순 크루 발견 페이지(리치 카드). */
public record CrewDiscoveryResponse(List<CrewDiscoveryItem> crews, boolean hasMore) {}
