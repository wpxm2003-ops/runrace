package com.runrace.backend.rival.dto;

import java.util.UUID;

/** 라이벌 목록 한 줄 — 닉네임 + 나 기준 누적 전적(끝난 레이스 합산). 승률은 프론트에서 계산. */
public record RivalRow(UUID rivalUserId, String nickname, int wins, int losses) {}
