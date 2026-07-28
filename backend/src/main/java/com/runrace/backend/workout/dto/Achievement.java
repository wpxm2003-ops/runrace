package com.runrace.backend.workout.dto;

/**
 * 운동 저장 직후 계산되는 "오늘의 성과" 한 건.
 * 문구는 프론트가 code + 숫자값으로 로컬라이즈한다(5개 언어). 백엔드는 판정만 한다.
 *
 * @param code   성과 종류 식별자(FIRST_RUN, ALL_TIME_DISTANCE, STREAK, CREW_GOAL_REACHED 등)
 * @param value  1차 숫자값(거리 m·연속일·횟수·퍼센트·순위 등, code마다 의미가 다름). 없으면 null
 * @param value2 2차 숫자값(순위의 전체 인원 등). 없으면 null
 */
public record Achievement(String code, Long value, Long value2) {
  public static Achievement of(String code) {
    return new Achievement(code, null, null);
  }

  public static Achievement of(String code, long value) {
    return new Achievement(code, value, null);
  }

  public static Achievement of(String code, long value, long value2) {
    return new Achievement(code, value, value2);
  }
}
