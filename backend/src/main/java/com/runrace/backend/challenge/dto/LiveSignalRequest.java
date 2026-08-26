package com.runrace.backend.challenge.dto;

/**
 * 라이브 진행률 일시정지·삭제 요청.
 *
 * <p>{@code sentAt}(요청을 만든 클라이언트 시각, ms)만 담는다. 핑과 같은 토큰을 써야 "종료 직전에
 * 발신돼 뒤늦게 도착한 핑"을 이 신호가 무효화할 수 있다 — 토큰이 없으면 멈춤 신호가 지각 핑에
 * 덮여 "러닝 중" 표시가 되살아난다.
 */
public record LiveSignalRequest(long sentAt) {}
