package com.runrace.backend.goal.domain;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.TemporalAdjusters;

/**
 * 개인 주간 집계의 한 주 — [월요일 00:00, 다음 월요일 00:00)의 현지 벽시계 구간.
 *
 * <p>홈 '이번 주 활동' 카드(homeDashboard.ts weekDateKeys)와 이번 주 최장 거리 성과가 쓰는
 * 기준과 같다: 월요일 시작, 운동의 날짜는 started_at_local(기기 벽시계)로 판정한다.
 * 어느 날이 "오늘"인지는 호출자가 사용자 시간대로 정해서 넘긴다.
 */
public record WeekWindow(LocalDate start) {

  public static WeekWindow containing(LocalDate day) {
    return new WeekWindow(day.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)));
  }

  public LocalDateTime from() {
    return start.atStartOfDay();
  }

  public LocalDateTime to() {
    return start.plusDays(7).atStartOfDay();
  }

  public boolean contains(LocalDateTime local) {
    return !local.isBefore(from()) && local.isBefore(to());
  }

  public WeekWindow minusWeeks(int weeks) {
    return new WeekWindow(start.minusWeeks(weeks));
  }
}
