package com.runrace.backend.crew.dto;

import java.util.List;

/** 멤버 수 내림차순 크루 탐색 페이지. */
public record CrewDiscoveryResponse(List<CrewSearchItem> crews, boolean hasMore) {}
