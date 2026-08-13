package com.runrace.backend.observability.service;

import org.slf4j.Logger;

/**
 * 스케줄러 건별 격리 관용구의 단일 출처 — 한 건의 실패가 배치 전체를 중단시키지 않게 한다.
 * 예외는 삼키고 "{label} — 건너뜀" 경고 로그 + error_log 적재로 대체한다.
 */
public final class SchedulerGuard {
  private SchedulerGuard() {}

  public static void runIsolated(
      Logger log, ErrorLogService errorLogService,
      String source, String label, String context, Runnable action) {
    try {
      action.run();
    } catch (Exception e) {
      log.warn("{} — 건너뜀", label, e);
      errorLogService.recordServiceError(
          source, e.getClass().getSimpleName(), e.getMessage(),
          ErrorLogService.stackTraceOf(e), context);
    }
  }
}
