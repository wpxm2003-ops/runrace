package com.runrace.backend.common;

import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;

/**
 * 레이스 등록 공용 규칙 — 일반 레이스(Challenge)와 크루 대항전(CrewMatch)이 공유한다.
 * "대결 기간·검증은 레이스 등록과 동일하게"라는 요구사항에 따라 단일 구현을 공유한다.
 */
public final class RaceRules {
  /** 시작~종료 최대 허용 기간(일). */
  public static final int MAX_DURATION_DAYS = 31;
  /** 목표 거리 상한(km). */
  public static final int MAX_GOAL_KM = 1000;

  private RaceRules() {}

  /** 시작·종료일시 검증 — null 금지, 과거 시작 금지(분 단위 절삭 비교), 종료는 시작 이후, 최대 기간 이내. */
  public static void validateWindow(OffsetDateTime startAt, OffsetDateTime endAt) {
    if (startAt == null || endAt == null) {
      throw ApiException.badRequest("invalid_dates");
    }
    OffsetDateTime nowMinute = OffsetDateTime.now().truncatedTo(ChronoUnit.MINUTES);
    if (startAt.truncatedTo(ChronoUnit.MINUTES).isBefore(nowMinute)) {
      throw ApiException.badRequest("invalid_start_at");
    }
    if (!endAt.isAfter(startAt)) {
      throw ApiException.badRequest("invalid_date_range");
    }
    if (endAt.isAfter(startAt.plusDays(MAX_DURATION_DAYS))) {
      throw ApiException.badRequest("race_duration_too_long");
    }
  }
}
