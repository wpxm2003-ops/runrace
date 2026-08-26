package com.runrace.backend.challenge.dto;

import java.util.UUID;

/**
 * 라이브 핑 응답의 라이벌 격차 한 줄.
 *
 * @param gapM (호출자의 이번 distanceM) - (라이벌의 현재 최선값). 양수면 내가 앞섬.
 */
public record RivalGapRow(UUID userId, String nickname, long gapM) {}
