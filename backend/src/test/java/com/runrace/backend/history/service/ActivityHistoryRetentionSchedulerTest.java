package com.runrace.backend.history.service;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.runrace.backend.history.repository.UserActivityHistoryRepository;
import com.runrace.backend.observability.service.ErrorLogService;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class ActivityHistoryRetentionSchedulerTest {

  @Mock UserActivityHistoryRepository repository;
  @Mock ErrorLogService errorLogService;

  @InjectMocks ActivityHistoryRetentionScheduler scheduler;

  private void retentionDays(int days) {
    ReflectionTestUtils.setField(scheduler, "retentionDays", days);
  }

  @Test
  void deletesUntilABatchComesBackShort() {
    retentionDays(365);
    when(repository.deleteOlderThan(any(), anyInt())).thenReturn(1_000, 1_000, 7);

    scheduler.purgeExpired();

    // 마지막 배치가 상한 미만이면 더 지울 것이 없다는 뜻이라 거기서 멈춰야 한다.
    verify(repository, times(3)).deleteOlderThan(any(), anyInt());
  }

  /** 상한이 없으면 첫 실행에서 밀린 이력을 한 번에 지우다 락을 오래 잡는다. */
  @Test
  void stopsAtTheBatchCeilingEvenWhenMoreRemains() {
    retentionDays(365);
    when(repository.deleteOlderThan(any(), anyInt())).thenReturn(1_000);

    scheduler.purgeExpired();

    verify(repository, times(50)).deleteOlderThan(any(), anyInt());
  }

  /** 0 이하는 정리 비활성화 — 쿼리 자체가 나가면 안 된다. */
  @Test
  void disabledWhenRetentionIsNotPositive() {
    retentionDays(0);

    scheduler.purgeExpired();

    verifyNoInteractions(repository);
  }

  @Test
  void cutoffIsRetentionDaysBeforeNow() {
    retentionDays(30);
    when(repository.deleteOlderThan(any(), anyInt())).thenReturn(0);
    OffsetDateTime before = OffsetDateTime.now(ZoneOffset.UTC).minusDays(30);

    scheduler.purgeExpired();

    ArgumentCaptor<OffsetDateTime> cutoff = ArgumentCaptor.forClass(OffsetDateTime.class);
    verify(repository).deleteOlderThan(cutoff.capture(), anyInt());
    OffsetDateTime after = OffsetDateTime.now(ZoneOffset.UTC).minusDays(30);
    assertTrue(!cutoff.getValue().isBefore(before) && !cutoff.getValue().isAfter(after));
  }

  /** 배치 하나가 실패해도 스케줄러가 예외를 밖으로 던지면 안 된다(SchedulerGuard 격리). */
  @Test
  void swallowsRepositoryFailure() {
    retentionDays(365);
    when(repository.deleteOlderThan(any(), anyInt()))
        .thenThrow(new RuntimeException("deadlock"));

    scheduler.purgeExpired();

    verify(errorLogService).recordServiceError(
        any(), any(), any(), any(), any());
    verify(repository, never()).save(any());
  }
}
