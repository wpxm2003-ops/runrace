package com.runrace.backend.common;

import java.time.ZoneId;

/**
 * KST(Asia/Seoul) 타임존의 단일 출처 — 5개 서비스가 각자 ZoneId.of("Asia/Seoul")을 선언하던 것을 통합.
 * 주의: 이 상수는 "어느 타임존이냐"만 공유한다. 주(week) 시작 기준처럼 도메인마다 다른 경계 계산
 * (CrewService의 월요일 정렬 vs ReengagementScheduler의 굴러가는 7일)은 서로 다른 개념이라
 * 여기서 합치지 않는다 — 각 서비스가 자기 경계 로직은 그대로 유지한다.
 */
public final class KstTime {
  private KstTime() {}

  public static final ZoneId ZONE = ZoneId.of("Asia/Seoul");
}
