package com.runrace.backend.activity.service;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.runrace.backend.activity.repository.UserDailyActiveRepository;
import com.runrace.backend.observability.service.ErrorLogService;
import java.time.LocalDate;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class DailyActiveRetentionSchedulerTest {

  @Mock UserDailyActiveRepository repository;
  @Mock ErrorLogService errorLogService;

  @InjectMocks DailyActiveRetentionScheduler scheduler;

  private void retentionDays(int days) {
    ReflectionTestUtils.setField(scheduler, "retentionDays", days);
  }

  @Test
  void deletesUntilABatchComesBackShort() {
    retentionDays(365);
    when(repository.deleteOlderThan(any(), anyInt())).thenReturn(1_000, 1_000, 7);

    scheduler.purgeExpired();

    verify(repository, times(3)).deleteOlderThan(any(), anyInt());
  }

  @Test
  void stopsAtTheBatchCeilingEvenWhenMoreRemains() {
    retentionDays(365);
    when(repository.deleteOlderThan(any(), anyInt())).thenReturn(1_000);

    scheduler.purgeExpired();

    verify(repository, times(50)).deleteOlderThan(any(), anyInt());
  }

  /** 활동 이력과 같은 설정을 쓴다 — 0 이하면 정리 비활성화. */
  @Test
  void disabledWhenRetentionIsNotPositive() {
    retentionDays(0);

    scheduler.purgeExpired();

    verifyNoInteractions(repository);
  }

  /** 기준은 "오늘(UTC) − 보존일수"보다 이른 local_date. */
  @Test
  void cutoffIsRetentionDaysBeforeTodayUtc() {
    retentionDays(365);
    when(repository.deleteOlderThan(any(), anyInt())).thenReturn(0);
    LocalDate before = LocalDate.now(ZoneOffset.UTC).minusDays(365);

    scheduler.purgeExpired();

    ArgumentCaptor<LocalDate> cutoff = ArgumentCaptor.forClass(LocalDate.class);
    verify(repository).deleteOlderThan(cutoff.capture(), anyInt());
    LocalDate after = LocalDate.now(ZoneOffset.UTC).minusDays(365);
    assertTrue(!cutoff.getValue().isBefore(before) && !cutoff.getValue().isAfter(after));
  }

  @Test
  void swallowsRepositoryFailure() {
    retentionDays(365);
    when(repository.deleteOlderThan(any(), anyInt())).thenThrow(new RuntimeException("deadlock"));

    scheduler.purgeExpired();

    verify(errorLogService).recordServiceError(any(), any(), any(), any(), any());
  }
}
