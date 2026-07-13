package com.runrace.backend.workout.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.common.ApiException;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * WorkoutService 순수 로직 회귀 잠금.
 * 외부 의존성(DB·S3·이벤트)이 없는 정적 계산 메서드와 입력값 검증을 대상으로 한다.
 */
class WorkoutServiceTest {

  // ── avgPaceSecPerKm ───────────────────────────────────────────────────────
  // package-private 정적 메서드 — 동일 패키지 테스트에서 직접 호출 가능.

  @Nested class AvgPaceSecPerKm {
    @Test void km당_5분이면_300초_per_km() {
      assertEquals(300, WorkoutService.avgPaceSecPerKm(1000, 300));
    }

    @Test void km당_5분_30분_러닝이면_360초_페이스() {
      assertEquals(360, WorkoutService.avgPaceSecPerKm(5000, 1800));
    }

    @Test void 거리_10m_미만이면_null() {
      assertNull(WorkoutService.avgPaceSecPerKm(9, 300));
    }

    @Test void 거리_정확히_10m이면_계산() {
      // 10m 10초 → 1000m 1000초
      assertEquals(1000, WorkoutService.avgPaceSecPerKm(10, 10));
    }

    @Test void 거리_0이면_null() {
      assertNull(WorkoutService.avgPaceSecPerKm(0, 300));
    }
  }

  // ── createIndoor 입력 검증 ────────────────────────────────────────────────
  // 검증 예외는 의존성 호출 전에 발생하므로 Mock 없이 테스트 가능.

  @Nested class CreateIndoorValidation {
    // WorkoutService를 직접 new 하면 의존성이 null이지만,
    // 검증 예외는 의존성 접근 전에 던져지므로 NullPointerException 없이 실행된다.
    private final WorkoutService service =
        new WorkoutService(null, null, null, null, null, null, null, null, null, null, null);

    private final AuthPrincipal p = new AuthPrincipal(UUID.randomUUID(), "uid");

    @Test void duration_0이면_duration_invalid() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.createIndoor(p, 1000, 0, "2026-01-01T00:00:00Z", null));
      assertEquals("duration_invalid", ex.code());
    }

    @Test void duration_36시간_초과이면_duration_invalid() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.createIndoor(p, 1000, 36 * 3600 + 1, "2026-01-01T00:00:00Z", null));
      assertEquals("duration_invalid", ex.code());
    }

    @Test void distance_0이면_distance_invalid() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.createIndoor(p, 0, 300, "2026-01-01T00:00:00Z", null));
      assertEquals("distance_invalid", ex.code());
    }

    @Test void distance_300km_초과이면_distance_invalid() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.createIndoor(p, 300_001, 300, "2026-01-01T00:00:00Z", null));
      assertEquals("distance_invalid", ex.code());
    }
  }

  // ── updateMemo 입력 검증 ─────────────────────────────────────────────────

  @Nested class UpdateMemoValidation {
    private final WorkoutService service =
        new WorkoutService(null, null, null, null, null, null, null, null, null, null, null);

    private final AuthPrincipal p = new AuthPrincipal(UUID.randomUUID(), "uid");

    @Test void 메모_500자_초과이면_memo_too_long() {
      String longMemo = "가".repeat(501);
      ApiException ex = assertThrows(ApiException.class,
          () -> service.updateMemo(p, 1L, longMemo));
      assertEquals("memo_too_long", ex.code());
    }

    @Test void 메모_500자는_허용() {
      // 500자는 통과 후 DB 조회로 넘어간다 — NullPointerException이 나면 검증은 통과한 것.
      String okMemo = "a".repeat(500);
      assertThrows(NullPointerException.class,
          () -> service.updateMemo(p, 1L, okMemo));
    }

    @Test void 메모_null은_허용() {
      assertThrows(NullPointerException.class,
          () -> service.updateMemo(p, 1L, null));
    }
  }

  // ── create (아웃도어) 입력 검증 ──────────────────────────────────────────

  @Nested class CreateValidation {
    private final WorkoutService service =
        new WorkoutService(null, null, null, null, null, null, null, null, null, null, null);

    private final AuthPrincipal p = new AuthPrincipal(UUID.randomUUID(), "uid");
    private final java.time.OffsetDateTime T = java.time.OffsetDateTime.parse("2026-01-01T00:00:00Z");

    @Test void duration_0이면_duration_invalid() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.create(p, T, T.plusSeconds(1), 0, 1000, 100, null, java.util.List.of(new WorkoutService.PathPoint(37.0, 127.0, null))));
      assertEquals("duration_invalid", ex.code());
    }

    @Test void 경로_비어있으면_path_empty() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.create(p, T, T.plusSeconds(1), 300, 1000, 100, null, java.util.List.of()));
      assertEquals("path_empty", ex.code());
    }

    @Test void 경로_null이면_path_empty() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.create(p, T, T.plusSeconds(1), 300, 1000, 100, null, null));
      assertEquals("path_empty", ex.code());
    }

    @Test void 종료가_시작보다_이전이면_time_range_invalid() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.create(p, T, T.minusSeconds(1), 300, 1000, 100, null,
              java.util.List.of(new WorkoutService.PathPoint(37.0, 127.0, null))));
      assertEquals("time_range_invalid", ex.code());
    }
  }
}
