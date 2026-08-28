package com.runrace.backend.challenge.dto;

import java.util.UUID;

/**
 * 라이브 진행률 핑 요청 — 저장 전(정지 전) 현재 GPS 러닝의 누적 거리와 경과(순수 활동) 시간.
 *
 * <p>{@code elapsedSec}은 첫 핑까지 포함해 매번 평균 속도를 검증하기 위한 값이다. 이전 핑과의
 * 델타만 보면 "첫 핑"에는 비교 대상이 없어 임의의 큰 거리를 그대로 받아들이게 된다.
 * 일시정지 시간은 빠진 활동 시간이라 평균 속도의 분모로 맞다.
 *
 * <p>{@code sentAt}은 이 요청을 만든 시각(클라이언트 ms)이다. 핑·일시정지·삭제가 같은 토큰을
 * 쓰고 서버는 더 큰 값만 받아들여, 셋 사이의 순서를 네트워크 재정렬과 무관하게 고정한다.
 * 순서 보정용이지 인가 수단이 아니다(V70 코멘트 참조).
 *
 * <p>{@code clientWorkoutId}는 러닝 시작 시 만든 멱등 UUID다. 같은 값이 workout_session에 이미
 * 있으면 확정 저장이 끝난 런의 지각 핑이므로 반영하지 않는다. 구버전 앱 요청은 null일 수 있다.
 */
public record LiveProgressRequest(
    int distanceM, int elapsedSec, long sentAt, UUID clientWorkoutId) {}
