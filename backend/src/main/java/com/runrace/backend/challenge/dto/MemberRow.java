package com.runrace.backend.challenge.dto;

import java.math.BigDecimal;
import java.util.UUID;

public record MemberRow(
    UUID userId,
    String nickname,
    BigDecimal totalKm,
    BigDecimal remainingKm,
    BigDecimal progressPercent,
    boolean finished,
    /** 완주 시각(ISO). 미완주면 null — 승부 요약의 시간 차 계산용. */
    String finishedAt,
    /** 종료 시 확정 순위(1=우승). 진행 중이면 null. */
    Integer finalRank,
    /** 로그인 사용자가 등록한 라이벌인지 — 색/라벨 표시용. */
    boolean isRival,
    /**
     * 이 멤버의 라이브(잠정) 진행률이 현재 신선한지 — 인증된 호출자에게만 true가 될 수 있다.
     * 비인증 호출자는 개인 식별 가능한 실시간 신호를 절대 받지 않으므로 항상 false.
     */
    boolean liveActive) {}
