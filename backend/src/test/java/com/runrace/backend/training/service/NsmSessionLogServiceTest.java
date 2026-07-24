package com.runrace.backend.training.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.runrace.backend.common.ApiException;
import com.runrace.backend.training.domain.NsmSessionLog;
import com.runrace.backend.training.dto.NsmSessionLogRequest;
import com.runrace.backend.training.repository.NsmSessionLogRepository;
import com.runrace.backend.training.repository.TrainingPlanRepository;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/** sub-T 세션 로깅 — 입력 검증과 중복(멱등) 처리. */
@ExtendWith(MockitoExtension.class)
class NsmSessionLogServiceTest {

  @Mock NsmSessionLogRepository logRepository;
  @Mock TrainingPlanRepository trainingPlanRepository;
  @InjectMocks NsmSessionLogService service;

  private final UUID userId = UUID.randomUUID();

  private static NsmSessionLogRequest req(Long workoutId, int day, String kind) {
    return new NsmSessionLogRequest(workoutId, day, kind, 280, 10, 10, true);
  }

  @Nested class Validation {
    @Test void 범위밖_요일이면_invalid_session_day() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.log(userId, req(1L, 7, "SHORT")));
      assertEquals("invalid_session_day", ex.code());
    }

    @Test void 음수_요일이면_invalid_session_day() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.log(userId, req(1L, -1, "SHORT")));
      assertEquals("invalid_session_day", ex.code());
    }

    @Test void 알수없는_종류면_invalid_session_kind() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.log(userId, req(1L, 1, "EASY")));
      assertEquals("invalid_session_kind", ex.code());
    }

    @Test void 종류가_null이면_invalid_session_kind() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.log(userId, req(1L, 1, null)));
      assertEquals("invalid_session_kind", ex.code());
    }
  }

  @Nested class Saving {
    @Test void 정상요청이면_저장된다() {
      when(logRepository.existsByWorkoutId(1L)).thenReturn(false);

      service.log(userId, req(1L, 3, "MEDIUM"));

      verify(logRepository).save(any(NsmSessionLog.class));
    }

    @Test void 같은_운동으로_재전송되면_저장하지_않는다() {
      when(logRepository.existsByWorkoutId(1L)).thenReturn(true);

      service.log(userId, req(1L, 3, "MEDIUM"));

      verify(logRepository, never()).save(any(NsmSessionLog.class));
    }

    @Test void workoutId가_없으면_중복검사_없이_저장된다() {
      service.log(userId, req(null, 5, "LONG"));

      verify(logRepository).save(any(NsmSessionLog.class));
      verify(logRepository, never()).existsByWorkoutId(any());
    }
  }
}
