package com.runrace.backend.activity.dto;

import java.util.List;

/**
 * 관리자 대시보드 재방문 지표. 같은 정의로 두 기준을 나란히 낸다.
 *
 * <ul>
 *   <li>visits — 방문 기준(user_daily_active). 배포 이후부터 쌓인다.
 *   <li>runs — 달리기 기준(workout_session.started_at_local). 과거 데이터로 바로 계산된다.
 * </ul>
 *
 * <p>날짜는 모두 사용자 현지 날짜이고, "오늘"은 {@code referenceTimeZone}(KST) 기준이다.
 * 날짜 필드는 yyyy-MM-dd 문자열이다.
 *
 * @param referenceDate 기준일(KST 오늘)
 * @param visitCollectionStartDate 첫 방문 핑을 받은 날(KST, 보통 배포일). 기록이 없으면 null.
 *     방문 기준 판정은 이 날이 아니라 그 다음 날부터 한다(첫날은 부분 수집)
 * @param newSignups7d 현지 가입일이 최근 7일(오늘 포함) 안인 가입자 수
 * @param cohorts 가입 주(월~일)별 코호트, 최근 주부터
 */
public record RetentionMetricsResponse(
    String referenceDate,
    String referenceTimeZone,
    String visitCollectionStartDate,
    long newSignups7d,
    ActiveUsers visits,
    ActiveUsers runs,
    List<Cohort> cohorts) {

  /**
   * @param dau 오늘 활동한 사용자 수(오늘은 아직 진행 중)
   * @param avgDau7d 어제까지 최근 7일의 일평균 DAU. 판정 가능한 날이 없으면 null
   * @param avgDauDays 평균에 쓴 날 수(방문 기준은 수집 첫날을 빼서 7보다 작을 수 있다)
   * @param wau 오늘 포함 최근 7일 동안 한 번이라도 활동한 사용자 수
   * @param mau 오늘 포함 최근 30일 동안 한 번이라도 활동한 사용자 수
   */
  public record ActiveUsers(long dau, Double avgDau7d, int avgDauDays, long wau, long mau) {}

  /**
   * @param weekStart 가입 주 월요일
   * @param weekEnd 가입 주 일요일
   * @param size 그 주 가입자 수(탈퇴 회원 포함, 운영자 제외)
   */
  public record Cohort(
      String weekStart, String weekEnd, int size, CohortRates visits, CohortRates runs) {}

  public record CohortRates(Cell d1, Cell d7, Cell d30) {}

  /**
   * @param eligible 그 D-n 날짜가 이미 끝나 판정할 수 있는 가입자 수(분모)
   * @param retained 그 날 활동한 가입자 수(분자)
   */
  public record Cell(int eligible, int retained) {}
}
