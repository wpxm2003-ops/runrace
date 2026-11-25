package com.runrace.backend.activity.service;

import com.runrace.backend.activity.repository.UserDailyActiveRepository;
import com.runrace.backend.observability.service.ErrorLogService;
import com.runrace.backend.observability.service.SchedulerGuard;
import java.time.LocalDate;
import java.time.ZoneOffset;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 일일 활성 기록 보존 기간 정리. 활동 이력({@code ActivityHistoryRetentionScheduler})과 같은
 * 설정값({@code runrace.history.retention-days}, 기본 365일)을 써서 두 기록의 보존 기간이
 * 어긋나지 않게 한다. 0 이하면 정리를 비활성화한다.
 *
 * <p>사용자 로컬 시각과 무관한 정리 작업이라 UTC 고정 시각에 하루 한 번 돈다(활동 이력 정리
 * 04:20 직후). 기준은 "오늘(UTC) − 보존일수"보다 이른 local_date. 단일 인스턴스 전제.
 */
@Component
@RequiredArgsConstructor
public class DailyActiveRetentionScheduler {
  private static final Logger log = LoggerFactory.getLogger(DailyActiveRetentionScheduler.class);

  /** 한 문장당 삭제 상한 — 긴 락을 피한다. */
  private static final int BATCH_SIZE = 1_000;
  /** 한 회차 총 상한. 남은 양은 다음 날 이어서 지운다. */
  private static final int MAX_BATCHES = 50;

  private final UserDailyActiveRepository repository;
  private final ErrorLogService errorLogService;

  @Value("${runrace.history.retention-days:365}")
  private int retentionDays;

  @Scheduled(cron = "0 30 4 * * *", zone = "UTC")
  public void purgeExpired() {
    SchedulerGuard.runIsolated(
        log,
        errorLogService,
        "daily-active-retention",
        "일일 활성 기록 보존 기간 정리",
        "retentionDays=" + retentionDays,
        this::purge);
  }

  /** 테스트에서 직접 호출한다(스케줄 트리거 없이 동작만 검증). */
  void purge() {
    if (retentionDays <= 0) return;
    LocalDate cutoff = LocalDate.now(ZoneOffset.UTC).minusDays(retentionDays);

    int total = 0;
    for (int batch = 0; batch < MAX_BATCHES; batch++) {
      int deleted = repository.deleteOlderThan(cutoff, BATCH_SIZE);
      total += deleted;
      if (deleted < BATCH_SIZE) break;
    }
    if (total > 0) {
      log.info("일일 활성 기록 {}건 정리 (기준 {} 이전)", total, cutoff);
    }
  }
}
