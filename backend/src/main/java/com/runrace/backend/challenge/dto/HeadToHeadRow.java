package com.runrace.backend.challenge.dto;

import java.util.UUID;

/** 현재 사용자 기준, 이 레이스의 라이벌 참여자와의 누적 전적(끝난 레이스 전부 합산). */
public record HeadToHeadRow(UUID opponentUserId, int wins, int losses) {}
