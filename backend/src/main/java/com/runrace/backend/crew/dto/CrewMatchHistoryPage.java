package com.runrace.backend.crew.dto;

import java.util.List;

/** 크루 대항전 전체 내역 페이지. */
public record CrewMatchHistoryPage(List<CrewMatchSummary> items, boolean hasNext) {}
