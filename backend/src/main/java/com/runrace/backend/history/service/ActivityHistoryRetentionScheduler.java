package com.runrace.backend.history.service;

import com.runrace.backend.history.repository.UserActivityHistoryRepository;
import com.runrace.backend.observability.service.ErrorLogService;
import com.runrace.backend.observability.service.SchedulerGuard;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 활동 이력 보존 기간 정리. user_activity_history는 운영 확인용 로그라 삭제 경로가 없으면
 * 무한히 자란다 — 수집 범위를 넓힌 뒤로는 운동 시작마다 행이 하나씩 쌓인다.
 *
 * <p>사용자 로컬 시각과 무관한 정리 작업이라 UTC 고정 시각에 하루 한 번 돈다(스케줄러의
 * 로컬 시각 분기 규칙이 적용되지 않는 유일한 부류다).
 *
 * <p>{@code runrace.history.retention-days}를 0 이하로 두면 정리를 비활성화한다.
 * 단일 인스턴스 전제(분산 락 없음).
 */
@Component
@RequiredArgsConstructor
public class ActivityHistoryRetentionScheduler {
  private static final Logger log = LoggerFactory.getLogger(ActivityHistoryRetentionScheduler.class);

  /** 한 문장당 삭제 상한 — 긴 락을 피한다. */
  private static final int BATCH_SIZE = 1_000;
  /** 한 회차 총 상한. 첫 실행에서 밀린 양이 많아도 한 번에 다 지우지 않고 다음 날 이어서 지운다. */
  private static final int MAX_BATCHES = 50;

  private final UserActivityHistoryRepository repository;
  private final ErrorLogService errorLogService;

  @Value("${runrace.history.retention-days:365}")
  private int retentionDays;

  @Scheduled(cron = "0 20 4 * * *", zone = "UTC")
  public void purgeExpired() {
    SchedulerGuard.runIsolated(
        log,
        errorLogService,
        "activity-history-retention",
        "활동 이력 보존 기간 정리",
        "retentionDays=" + retentionDays,
        this::purge);
  }

  /** 테스트에서 직접 호출한다(스케줄 트리거 없이 동작만 검증). */
  void purge() {
    if (retentionDays <= 0) return;
    OffsetDateTime cutoff = OffsetDateTime.now(ZoneOffset.UTC).minusDays(retentionDays);

    int total = 0;
    for (int batch = 0; batch < MAX_BATCHES; batch++) {
      int deleted = repository.deleteOlderThan(cutoff, BATCH_SIZE);
      total += deleted;
      if (deleted < BATCH_SIZE) break;
    }
    if (total > 0) {
      log.info("활동 이력 {}건 정리 (기준 {} 이전)", total, cutoff);
    }
  }
}
