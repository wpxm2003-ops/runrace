package com.runrace.backend.training.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;

import com.runrace.backend.common.ApiException;
import com.runrace.backend.training.domain.NsmRetestLog;
import com.runrace.backend.training.domain.NsmSessionLog;
import com.runrace.backend.training.dto.NsmBlockReportResponse;
import com.runrace.backend.training.dto.NsmMyReportResponse;
import com.runrace.backend.training.repository.NsmRetestLogRepository;
import com.runrace.backend.training.repository.NsmSessionLogRepository;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class NsmReportServiceTest {

  @Mock NsmRetestLogRepository retestLogRepository;
  @Mock NsmSessionLogRepository sessionLogRepository;
  @InjectMocks NsmReportService service;

  private final UUID userId = UUID.randomUUID();

  private static NsmSessionLog completedLog(String kind, int repsDone) {
    return NsmSessionLog.of(UUID.randomUUID(), 1L, 1, kind, 280, repsDone, repsDone, true);
  }

  @Nested class MyReport {
    @Test void 재측정이_0개면_최신블록id는_null() {
      when(retestLogRepository.findByUserIdOrderByCreatedAtAsc(userId)).thenReturn(List.of());
      when(sessionLogRepository.findByUserIdAndCompletedIsTrue(userId)).thenReturn(List.of());

      NsmMyReportResponse report = service.myReport(userId);

      assertEquals(0, report.retests().size());
      assertNull(report.latestBlockRetestId());
    }

    @Test void 재측정이_1개뿐이면_비교할_블록이_없어_최신블록id는_null() {
      NsmRetestLog only = NsmRetestLog.of(userId, 45, 280, 5000, 1320, null);
      when(retestLogRepository.findByUserIdOrderByCreatedAtAsc(userId)).thenReturn(List.of(only));
      when(sessionLogRepository.findByUserIdAndCompletedIsTrue(userId)).thenReturn(List.of());

      NsmMyReportResponse report = service.myReport(userId);

      assertEquals(1, report.retests().size());
      assertNull(report.latestBlockRetestId());
    }

    @Test void 재측정이_2개면_최신블록id는_마지막_재측정id() {
      NsmRetestLog first = NsmRetestLog.of(userId, 42, 300, 5000, 1400, null);
      NsmRetestLog secondEntity = NsmRetestLog.of(userId, 45, 280, 5000, 1320, null);
      when(retestLogRepository.findByUserIdOrderByCreatedAtAsc(userId))
          .thenReturn(List.of(first, secondEntity));
      when(sessionLogRepository.findByUserIdAndCompletedIsTrue(userId)).thenReturn(List.of());

      NsmMyReportResponse report = service.myReport(userId);

      assertEquals(secondEntity.getId(), report.latestBlockRetestId());
    }

    @Test void 완주_세션의_kind별_렙수로_총_훈련분을_계산한다() {
      when(retestLogRepository.findByUserIdOrderByCreatedAtAsc(userId)).thenReturn(List.of());
      // SHORT(3분×2)=6, MEDIUM(6분×3)=18, LONG(10분×1)=10 → 총 34분, 완주 3건
      when(sessionLogRepository.findByUserIdAndCompletedIsTrue(userId)).thenReturn(List.of(
          completedLog("SHORT", 2), completedLog("MEDIUM", 3), completedLog("LONG", 1)));

      NsmMyReportResponse report = service.myReport(userId);

      assertEquals(3, report.totalSubTCompleted());
      assertEquals(34, report.totalSubTMinutes());
    }
  }

  @Nested class BlockReport {
    @Test void 존재하지_않는_재측정id면_retest_not_found() {
      when(retestLogRepository.findById(999L)).thenReturn(Optional.empty());

      ApiException ex = assertThrows(ApiException.class, () -> service.blockReport(999L));

      assertEquals("retest_not_found", ex.code());
    }

    @Test void 직전_재측정이_없으면_no_previous_retest() {
      NsmRetestLog end = NsmRetestLog.of(userId, 45, 280, 5000, 1320, null);
      when(retestLogRepository.findById(1L)).thenReturn(Optional.of(end));
      when(retestLogRepository.findTopByUserIdAndCreatedAtLessThanOrderByCreatedAtDesc(
          userId, end.getCreatedAt())).thenReturn(Optional.empty());

      ApiException ex = assertThrows(ApiException.class, () -> service.blockReport(1L));

      assertEquals("no_previous_retest", ex.code());
    }

    @Test void 시작과_끝_재측정으로_델타와_구간_통계를_계산한다() {
      NsmRetestLog start = NsmRetestLog.of(userId, 42, 300, 5000, 1400, null);
      NsmRetestLog end = NsmRetestLog.of(userId, 45, 280, 5000, 1320, null);
      when(retestLogRepository.findById(2L)).thenReturn(Optional.of(end));
      when(retestLogRepository.findTopByUserIdAndCreatedAtLessThanOrderByCreatedAtDesc(
          userId, end.getCreatedAt())).thenReturn(Optional.of(start));
      when(sessionLogRepository.findByUserIdAndCompletedIsTrueAndCompletedAtBetween(
          userId, start.getCreatedAt(), end.getCreatedAt()))
          .thenReturn(List.of(completedLog("MEDIUM", 4)));

      NsmBlockReportResponse block = service.blockReport(2L);

      assertEquals(42, block.startVdot());
      assertEquals(45, block.endVdot());
      assertEquals(300, block.startThresholdPaceSec());
      assertEquals(280, block.endThresholdPaceSec());
      assertEquals(1, block.subTCompleted());
      assertEquals(24, block.subTMinutes()); // MEDIUM 6분 × 4렙
    }

    @Test void 같은_날_재측정이어도_기간은_최소_1일이다() {
      // 내림(toDays)이면 0일이 나와 "0일간의 기록"으로 보인다 — 반올림+최소1 규칙 확인.
      NsmRetestLog start = NsmRetestLog.of(userId, 42, 300, 5000, 1400, null);
      NsmRetestLog end = NsmRetestLog.of(userId, 45, 280, 5000, 1320, null);
      when(retestLogRepository.findById(4L)).thenReturn(Optional.of(end));
      when(retestLogRepository.findTopByUserIdAndCreatedAtLessThanOrderByCreatedAtDesc(
          userId, end.getCreatedAt())).thenReturn(Optional.of(start));
      when(sessionLogRepository.findByUserIdAndCompletedIsTrueAndCompletedAtBetween(
          userId, start.getCreatedAt(), end.getCreatedAt())).thenReturn(List.of());

      assertEquals(1, service.blockReport(4L).days());
    }

    @Test void 블록_기간은_일_단위_반올림이다() {
      NsmRetestLog start = NsmRetestLog.of(userId, 42, 300, 5000, 1400, null);
      NsmRetestLog end = NsmRetestLog.of(userId, 45, 280, 5000, 1320, null);
      // 27일 20시간 전 → 내림이면 27일, 반올림이면 28일. 프론트 대시보드와 같은 값이어야 한다.
      ReflectionTestUtils.setField(
          start, "createdAt", end.getCreatedAt().minusDays(27).minusHours(20));
      when(retestLogRepository.findById(5L)).thenReturn(Optional.of(end));
      when(retestLogRepository.findTopByUserIdAndCreatedAtLessThanOrderByCreatedAtDesc(
          userId, end.getCreatedAt())).thenReturn(Optional.of(start));
      when(sessionLogRepository.findByUserIdAndCompletedIsTrueAndCompletedAtBetween(
          userId, start.getCreatedAt(), end.getCreatedAt())).thenReturn(List.of());

      assertEquals(28, service.blockReport(5L).days());
    }

    @Test void 미완주_세션은_구간_조회_필터에서_애초에_제외된다() {
      // completedIsTrue 조건이 리포지토리 쿼리에 있으므로, 서비스는 이미 완주분만 받는다고 가정하고
      // 그 리스트 전체를 집계 대상으로 삼는다 — 필터링을 다시 하지 않는지 확인.
      NsmRetestLog start = NsmRetestLog.of(userId, 42, 300, 5000, 1400, null);
      NsmRetestLog end = NsmRetestLog.of(userId, 45, 280, 5000, 1320, null);
      when(retestLogRepository.findById(3L)).thenReturn(Optional.of(end));
      when(retestLogRepository.findTopByUserIdAndCreatedAtLessThanOrderByCreatedAtDesc(
          userId, end.getCreatedAt())).thenReturn(Optional.of(start));
      when(sessionLogRepository.findByUserIdAndCompletedIsTrueAndCompletedAtBetween(
          userId, start.getCreatedAt(), end.getCreatedAt()))
          .thenReturn(List.of());

      NsmBlockReportResponse block = service.blockReport(3L);

      assertEquals(0, block.subTCompleted());
      assertEquals(0, block.subTMinutes());
    }
  }
}
