package com.runrace.backend.shoe.dto;

/**
 * 신발 등록/수정 요청.
 * {@code active}는 등록 시에만 반영(수정은 활성화 전용 엔드포인트 사용).
 */
public record ShoeFormRequest(
    String brand,
    String model,
    String nickname,
    Integer targetDistanceM,
    Boolean active) {}
