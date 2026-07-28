package com.runrace.backend.training.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotSame;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.runrace.backend.common.ApiException;
import com.runrace.backend.training.domain.NsmRetestLog;
import com.runrace.backend.training.domain.TrainingPlan;
import com.runrace.backend.training.dto.TrainingPlanRequest;
import com.runrace.backend.training.repository.NsmRetestLogRepository;
import com.runrace.backend.training.repository.TrainingPlanRepository;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class TrainingPlanServiceTest {

  @Mock TrainingPlanRepository trainingPlanRepository;
  @Mock NsmRetestLogRepository retestLogRepository;
  @InjectMocks TrainingPlanService service;

  private final UUID userId = UUID.randomUUID();

  private static TrainingPlanRequest req(double vdot, int threshold, int[] days, int distM, int timeSec) {
    return new TrainingPlanRequest(vdot, threshold, days, distM, timeSec, null);
  }

  private static TrainingPlanRequest reqWithBand(
      double vdot, int threshold, int[] days, int distM, int timeSec, Integer band) {
    return new TrainingPlanRequest(vdot, threshold, days, distM, timeSec, band);
  }

  private static final int[] OK_DAYS = {1, 3, 5};

  @Nested class VdotValidation {
    @Test void 영이하_vdot이면_invalid_vdot() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.save(userId, req(0, 280, OK_DAYS, 5000, 1320)));
      assertEquals("invalid_vdot", ex.code());
    }

    @Test void 음수_vdot이면_invalid_vdot() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.save(userId, req(-1, 280, OK_DAYS, 5000, 1320)));
      assertEquals("invalid_vdot", ex.code());
    }

    @Test void NaN_vdot이면_invalid_vdot() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.save(userId, req(Double.NaN, 280, OK_DAYS, 5000, 1320)));
      assertEquals("invalid_vdot", ex.code());
    }

    @Test void Infinity_vdot이면_invalid_vdot() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.save(userId, req(Double.POSITIVE_INFINITY, 280, OK_DAYS, 5000, 1320)));
      assertEquals("invalid_vdot", ex.code());
    }

    @Test void 상한초과_vdot이면_invalid_vdot() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.save(userId, req(101, 280, OK_DAYS, 5000, 1320)));
      assertEquals("invalid_vdot", ex.code());
    }
  }

  @Nested class ThresholdValidation {
    @Test void 하한미만_역치면_invalid_threshold() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.save(userId, req(45, 100, OK_DAYS, 5000, 1320)));
      assertEquals("invalid_threshold", ex.code());
    }

    @Test void 상한초과_역치면_invalid_threshold() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.save(userId, req(45, 1000, OK_DAYS, 5000, 1320)));
      assertEquals("invalid_threshold", ex.code());
    }

    @Test void 하한근접_149는_invalid_threshold() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.save(userId, req(45, 149, OK_DAYS, 5000, 1320)));
      assertEquals("invalid_threshold", ex.code());
    }

    @Test void 상한근접_601은_invalid_threshold() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.save(userId, req(45, 601, OK_DAYS, 5000, 1320)));
      assertEquals("invalid_threshold", ex.code());
    }
  }

  @Nested class SourceValidation {
    @Test void 거리0이면_invalid_source_record() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.save(userId, req(45, 280, OK_DAYS, 0, 1320)));
      assertEquals("invalid_source_record", ex.code());
    }

    @Test void 시간0이면_invalid_source_record() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.save(userId, req(45, 280, OK_DAYS, 5000, 0)));
      assertEquals("invalid_source_record", ex.code());
    }
  }

  @Nested class SubTDaysValidation {
    @Test void 요일_1개면_invalid_sub_t_days() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.save(userId, req(45, 280, new int[] {1}, 5000, 1320)));
      assertEquals("invalid_sub_t_days", ex.code());
    }

    @Test void 요일_4개면_invalid_sub_t_days() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.save(userId, req(45, 280, new int[] {1, 2, 3, 4}, 5000, 1320)));
      assertEquals("invalid_sub_t_days", ex.code());
    }

    @Test void 범위밖_요일이면_invalid_sub_t_days() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.save(userId, req(45, 280, new int[] {1, 7}, 5000, 1320)));
      assertEquals("invalid_sub_t_days", ex.code());
    }
  }

  @Nested class WeeklyBandValidation {
    @Test void 밴드0_요일1개면_저장되고_weeklyBand가_저장된다() {
      when(trainingPlanRepository.findByUserId(userId)).thenReturn(Optional.empty());
      when(trainingPlanRepository.save(any(TrainingPlan.class))).thenAnswer(inv -> inv.getArgument(0));

      TrainingPlan saved = service.save(userId, reqWithBand(45, 280, new int[] {2}, 5000, 1320, 0));

      assertEquals("2", saved.getSubTDays());
      assertEquals(1, saved.getSessionsPerWeek());
      assertEquals(Integer.valueOf(0), saved.getWeeklyBand());
    }

    @Test void 밴드0_요일2개면_invalid_sub_t_days() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.save(userId, reqWithBand(45, 280, new int[] {1, 3}, 5000, 1320, 0)));
      assertEquals("invalid_sub_t_days", ex.code());
    }

    @Test void 밴드4_요일1개면_invalid_sub_t_days() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.save(userId, reqWithBand(45, 280, new int[] {1}, 5000, 1320, 4)));
      assertEquals("invalid_sub_t_days", ex.code());
    }

    @Test void 범위밖_밴드면_invalid_weekly_band() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.save(userId, reqWithBand(45, 280, OK_DAYS, 5000, 1320, 5)));
      assertEquals("invalid_weekly_band", ex.code());
    }

    @Test void 밴드_미지정이면_기존대로_요일1개는_invalid_sub_t_days() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.save(userId, req(45, 280, new int[] {1}, 5000, 1320)));
      assertEquals("invalid_sub_t_days", ex.code());
    }
  }

  @Nested class ValidSave {
    @Test void 정상요청이면_저장되고_요일이_정규화된다() {
      when(trainingPlanRepository.findByUserId(userId)).thenReturn(Optional.empty());
      when(trainingPlanRepository.save(any(TrainingPlan.class))).thenAnswer(inv -> inv.getArgument(0));

      // 중복·비정렬 요일 → dedup·정렬 CSV
      TrainingPlan saved = service.save(userId, req(45, 280, new int[] {5, 1, 3, 1}, 5000, 1320));

      assertEquals("1,3,5", saved.getSubTDays());
      assertEquals(3, saved.getSessionsPerWeek());
      assertEquals(280, saved.getThresholdPaceSec());
    }
  }

  /** training_plan은 upsert라 재측정 이력을 별도로 append 로그하지 않으면 과거 값이 영영 사라진다. */
  @Nested class RetestLogging {
    @Test void 첫_저장이면_재측정_로그를_남긴다() {
      when(trainingPlanRepository.findByUserId(userId)).thenReturn(Optional.empty());
      when(trainingPlanRepository.save(any(TrainingPlan.class))).thenAnswer(inv -> inv.getArgument(0));
      when(retestLogRepository.findTopByUserIdOrderByCreatedAtDesc(userId)).thenReturn(Optional.empty());

      service.save(userId, req(45, 280, OK_DAYS, 5000, 1320));

      verify(retestLogRepository, times(1)).save(any(NsmRetestLog.class));
    }

    @Test void 원본기록이_직전_재측정과_같으면_로그를_남기지_않는다() {
      when(trainingPlanRepository.findByUserId(userId)).thenReturn(Optional.empty());
      when(trainingPlanRepository.save(any(TrainingPlan.class))).thenAnswer(inv -> inv.getArgument(0));
      NsmRetestLog last = NsmRetestLog.of(userId, 45, 280, 5000, 1320, null);
      when(retestLogRepository.findTopByUserIdOrderByCreatedAtDesc(userId)).thenReturn(Optional.of(last));

      // band만 바뀌고 원본 기록(거리·시간)은 동일 — 새 재측정이 아니다. (band 4는 2~3일 허용, OK_DAYS=3일과 호환)
      service.save(userId, reqWithBand(45, 280, OK_DAYS, 5000, 1320, 4));

      verify(retestLogRepository, never()).save(any(NsmRetestLog.class));
    }

    @Test void 원본기록이_직전_재측정과_다르면_새_로그를_append한다() {
      when(trainingPlanRepository.findByUserId(userId)).thenReturn(Optional.empty());
      when(trainingPlanRepository.save(any(TrainingPlan.class))).thenAnswer(inv -> inv.getArgument(0));
      NsmRetestLog last = NsmRetestLog.of(userId, 42, 300, 5000, 1400, null);
      // 4주 전 재측정 — 정정 윈도우(1시간) 밖이므로 진짜 재측정으로 append돼야 한다.
      ReflectionTestUtils.setField(last, "createdAt", OffsetDateTime.now().minusDays(28));
      when(retestLogRepository.findTopByUserIdOrderByCreatedAtDesc(userId)).thenReturn(Optional.of(last));

      // 5K 기록이 1400초 → 1320초로 갱신 — 진짜 재측정.
      service.save(userId, req(45, 280, OK_DAYS, 5000, 1320));

      ArgumentCaptor<NsmRetestLog> captor = ArgumentCaptor.forClass(NsmRetestLog.class);
      verify(retestLogRepository, times(1)).save(captor.capture());
      assertNotSame(last, captor.getValue());
      assertEquals(1320, captor.getValue().getSourceTimeSec());
    }

    @Test void 정정_윈도우_안의_재저장은_직전_로그를_고친다() {
      when(trainingPlanRepository.findByUserId(userId)).thenReturn(Optional.empty());
      when(trainingPlanRepository.save(any(TrainingPlan.class))).thenAnswer(inv -> inv.getArgument(0));
      // 방금(1시간 이내) 남긴 로그 — 2:50/km 같은 오타를 바로 고치는 상황.
      NsmRetestLog last = NsmRetestLog.of(userId, 42, 300, 5000, 1400, null);
      when(retestLogRepository.findTopByUserIdOrderByCreatedAtDesc(userId)).thenReturn(Optional.of(last));
      when(retestLogRepository.findTopByUserIdAndCreatedAtLessThanOrderByCreatedAtDesc(
          eq(userId), any(OffsetDateTime.class))).thenReturn(Optional.empty());

      service.save(userId, req(45, 280, OK_DAYS, 5000, 1320));

      ArgumentCaptor<NsmRetestLog> captor = ArgumentCaptor.forClass(NsmRetestLog.class);
      verify(retestLogRepository, times(1)).save(captor.capture());
      assertSame(last, captor.getValue()); // 새 행이 아니라 기존 행을 덮어썼다
      assertEquals(1320, last.getSourceTimeSec());
      assertEquals(45, last.getVdot());
    }

    @Test void 정정으로_이전_재측정과_같은_기록으로_되돌리면_행을_지운다() {
      when(trainingPlanRepository.findByUserId(userId)).thenReturn(Optional.empty());
      when(trainingPlanRepository.save(any(TrainingPlan.class))).thenAnswer(inv -> inv.getArgument(0));
      // 원래 기록 1400초(과거) → 실수로 1200초 입력(방금) → 다시 1400초로 되돌리는 저장.
      NsmRetestLog beforeLast = NsmRetestLog.of(userId, 42, 300, 5000, 1400, null);
      NsmRetestLog last = NsmRetestLog.of(userId, 50, 260, 5000, 1200, null);
      when(retestLogRepository.findTopByUserIdOrderByCreatedAtDesc(userId)).thenReturn(Optional.of(last));
      when(retestLogRepository.findTopByUserIdAndCreatedAtLessThanOrderByCreatedAtDesc(
          eq(userId), any(OffsetDateTime.class))).thenReturn(Optional.of(beforeLast));

      service.save(userId, req(42, 300, OK_DAYS, 5000, 1400));

      verify(retestLogRepository).delete(last);
      verify(retestLogRepository, never()).save(any(NsmRetestLog.class));
    }
  }
}
