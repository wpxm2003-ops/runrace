package com.runrace.backend.workout.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.common.ApiException;
import com.runrace.backend.workout.dto.GhostRaceResultDto;
import java.time.OffsetDateTime;
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
        new WorkoutService(null, null, null, null, null, null, null, null, null, null, null, null);

    private final AuthPrincipal p = new AuthPrincipal(UUID.randomUUID(), "uid");

    @Test void duration_0이면_duration_invalid() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.createIndoor(p, 1000, 0, "2026-01-01T00:00:00Z", null, null));
      assertEquals("duration_invalid", ex.code());
    }

    @Test void duration_36시간_초과이면_duration_invalid() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.createIndoor(p, 1000, 36 * 3600 + 1, "2026-01-01T00:00:00Z", null, null));
      assertEquals("duration_invalid", ex.code());
    }

    @Test void distance_0이면_distance_invalid() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.createIndoor(p, 0, 300, "2026-01-01T00:00:00Z", null, null));
      assertEquals("distance_invalid", ex.code());
    }

    @Test void distance_300km_초과이면_distance_invalid() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.createIndoor(p, 300_001, 300, "2026-01-01T00:00:00Z", null, null));
      assertEquals("distance_invalid", ex.code());
    }

    // startedAt은 예전에 검증 없이 바로 파싱돼, 잘못된 값이 400이 아니라 500으로 나갔다.
    @Test void startedAt이_null이면_started_at_invalid() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.createIndoor(p, 1000, 300, null, null, null));
      assertEquals("started_at_invalid", ex.code());
    }

    @Test void startedAt_형식이_틀리면_started_at_invalid() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.createIndoor(p, 1000, 300, "어제", null, null));
      assertEquals("started_at_invalid", ex.code());
    }

    @Test void startedAt이_먼_미래면_started_at_future() {
      String future = OffsetDateTime.now().plusDays(1).toString();
      ApiException ex = assertThrows(ApiException.class,
          () -> service.createIndoor(p, 1000, 300, future, null, null));
      assertEquals("started_at_future", ex.code());
    }

    // 기기 시계가 조금 빠른 경우는 흡수해야 한다(정상 저장 경로로 넘어가야 함).
    @Test void startedAt이_시계오차_범위의_미래면_통과한다() {
      String slightlyFuture = OffsetDateTime.now().plusMinutes(5).toString();
      // 의존성이 null이라 검증을 통과하면 NPE가 난다 — ApiException이 아니라는 것이 곧 통과의 증거.
      assertThrows(NullPointerException.class,
          () -> service.createIndoor(p, 1000, 300, slightlyFuture, null, null));
    }
  }

  // ── updateMemo 입력 검증 ─────────────────────────────────────────────────

  @Nested class UpdateMemoValidation {
    private final WorkoutService service =
        new WorkoutService(null, null, null, null, null, null, null, null, null, null, null, null);

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
        new WorkoutService(null, null, null, null, null, null, null, null, null, null, null, null);

    private final AuthPrincipal p = new AuthPrincipal(UUID.randomUUID(), "uid");
    private final java.time.OffsetDateTime T = java.time.OffsetDateTime.parse("2026-01-01T00:00:00Z");

    @Test void duration_0이면_duration_invalid() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.create(p, T, T.plusSeconds(1), 0, 1000, 100, null, java.util.List.of(new WorkoutService.PathPoint(37.0, 127.0, null)), null, null, null));
      assertEquals("duration_invalid", ex.code());
    }

    @Test void 경로_비어있으면_path_empty() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.create(p, T, T.plusSeconds(1), 300, 1000, 100, null, java.util.List.of(), null, null, null));
      assertEquals("path_empty", ex.code());
    }

    @Test void 경로_null이면_path_empty() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.create(p, T, T.plusSeconds(1), 300, 1000, 100, null, null, null, null, null));
      assertEquals("path_empty", ex.code());
    }

    @Test void 종료가_시작보다_이전이면_time_range_invalid() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.create(p, T, T.minusSeconds(1), 300, 1000, 100, null,
              java.util.List.of(new WorkoutService.PathPoint(37.0, 127.0, null)), null, null, null));
      assertEquals("time_range_invalid", ex.code());
    }

    @Test void 시작시각이_먼_미래면_started_at_future() {
      OffsetDateTime future = OffsetDateTime.now().plusDays(1);
      ApiException ex = assertThrows(ApiException.class,
          () -> service.create(p, future, future.plusSeconds(10), 5, 10, 1, null,
              java.util.List.of(new WorkoutService.PathPoint(37.0, 127.0, 0L)), null, null, null));
      assertEquals("started_at_future", ex.code());
    }

    @Test void duration이_시작종료_범위를_초과하면_duration_exceeds_time_range() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.create(p, T, T.plusSeconds(10), 300, 10, 1, null,
              java.util.List.of(new WorkoutService.PathPoint(37.0, 127.0, 0L)), null, null, null));
      assertEquals("duration_exceeds_time_range", ex.code());
    }

    // "1포인트로 300km" 같은 노골적 조작 — 신고 거리 대비 경로 포인트가 터무니없이 적으면 거부한다.
    @Test void 포인트_1개로_300km_신고하면_path_too_sparse() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.create(p, T, T.plusHours(36), 129_600, 300_000, 20_000, null,
              java.util.List.of(new WorkoutService.PathPoint(37.0, 127.0, 0L)), null, null, null));
      assertEquals("path_too_sparse", ex.code());
    }

    // 포인트 개수 요건만 채우려고 같은 좌표를 반복 제출하는 우회 — 거리 재계산 없이도 막는다.
    @Test void 같은_좌표를_반복해서_밀도_요건만_채우면_path_all_same_point() {
      java.util.List<WorkoutService.PathPoint> path = java.util.stream.IntStream.range(0, 6_000)
          .mapToObj(i -> new WorkoutService.PathPoint(37.0, 127.0, i * 1_000L))
          .toList();

      ApiException ex = assertThrows(ApiException.class,
          () -> service.create(p, T, T.plusHours(36), 129_600, 300_000, 20_000, null,
              path, null, null, null));

      assertEquals("path_all_same_point", ex.code());
    }

    // GPS 오차로 좌표가 조금씩 흔들리는 정직한 기록은(경로 실거리 재계산·비교를 안 하므로) 통과해야 한다.
    @Test void 좌표가_조금씩_달라지면_거리검증을_통과한다() {
      java.util.List<WorkoutService.PathPoint> path = java.util.stream.IntStream.range(0, 6)
          .mapToObj(i -> new WorkoutService.PathPoint(37.0, 127.0 + i * 0.000001, i * 1_000L))
          .toList();

      // 입력 검증은 통과하고, 의존성이 없는 서비스라 그다음 lockUser에서 NPE가 난다 — 통과의 증거.
      assertThrows(NullPointerException.class,
          () -> service.create(p, T, T.plusMinutes(5), 300, 300, 65, 300,
              path, null, null, null));
    }

    @Test void NaN_좌표면_path_point_invalid() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.create(p, T, T.plusSeconds(10), 5, 0, 1, null,
              java.util.List.of(new WorkoutService.PathPoint(Double.NaN, 127.0, 0L)),
              null, null, null));
      assertEquals("path_point_invalid", ex.code());
    }

    @Test void 위도가_범위를_벗어나면_path_point_invalid() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.create(p, T, T.plusSeconds(10), 5, 10, 1, null,
              java.util.List.of(new WorkoutService.PathPoint(91.0, 127.0, 0L)), null, null, null));
      assertEquals("path_point_invalid", ex.code());
    }

    @Test void 경도가_범위를_벗어나면_path_point_invalid() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.create(p, T, T.plusSeconds(10), 5, 10, 1, null,
              java.util.List.of(new WorkoutService.PathPoint(37.0, -181.0, 0L)), null, null, null));
      assertEquals("path_point_invalid", ex.code());
    }

    @Test void 포인트_t가_음수면_path_point_invalid() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.create(p, T, T.plusSeconds(10), 5, 10, 1, null,
              java.util.List.of(new WorkoutService.PathPoint(37.0, 127.0, -1L)), null, null, null));
      assertEquals("path_point_invalid", ex.code());
    }

    @Test void 포인트_t가_역순이면_path_point_invalid() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.create(p, T, T.plusSeconds(10), 5, 10, 1, null,
              java.util.List.of(
                  new WorkoutService.PathPoint(37.0, 127.0, 5_000L),
                  new WorkoutService.PathPoint(37.001, 127.001, 1_000L)),
              null, null, null));
      assertEquals("path_point_invalid", ex.code());
    }

    @Test void breakBefore_마커가_있어도_t가_비내림차순이면_입력검증을_통과한다() {
      java.util.List<WorkoutService.PathPoint> path = java.util.List.of(
          new WorkoutService.PathPoint(37.0, 127.0, 1_000L),
          new WorkoutService.PathPoint(37.0005, 127.0, 1_000L, null, true));

      // 동일 t는 기존 계약대로 허용하고, breakBefore는 좌표·시간 검증 의미를 바꾸지 않는다.
      assertThrows(NullPointerException.class,
          () -> service.create(p, T, T.plusSeconds(10), 5, 10, 1, null,
              path, null, null, null));
    }

    // t가 없는 포인트(구형 기록)는 순서 검사를 건너뛰고 통과해야 한다.
    @Test void t가_없는_포인트는_순서검사를_건너뛴다() {
      assertThrows(NullPointerException.class,
          () -> service.create(p, T, T.plusSeconds(10), 5, 10, 1, null,
              java.util.List.of(new WorkoutService.PathPoint(37.0, 127.0, null)), null, null, null));
    }

    @Test void 고스트_id와_결과가_짝이_아니면_부수_정보를_무효로_본다() {
      assertFalse(WorkoutService.isGhostRacePayloadValid(1L, null));
    }

    @Test void 고스트_겹친_거리가_500m_미만이면_부수_정보를_무효로_본다() {
      GhostRaceResultDto result = new GhostRaceResultDto(499.9, 300_000, 290_000, 10_000);
      assertFalse(WorkoutService.isGhostRacePayloadValid(1L, result));
    }

    @Test void 고스트_delta는_1초_이내_반올림_오차를_허용한다() {
      GhostRaceResultDto result =
          new GhostRaceResultDto(2_345.67, 900_122, 710_178, 189_943);
      assertTrue(WorkoutService.isGhostRacePayloadValid(1L, result));
    }

    @Test void 고스트_delta가_1초를_넘게_어긋나면_부수_정보를_무효로_본다() {
      GhostRaceResultDto result =
          new GhostRaceResultDto(2_345.67, 900_122, 710_178, 188_943);
      assertFalse(WorkoutService.isGhostRacePayloadValid(1L, result));
    }

    @Test void 고스트_delta의_long_극단값을_거부한다() {
      GhostRaceResultDto result =
          new GhostRaceResultDto(2_345.67, 900_122, 710_178, Long.MIN_VALUE);
      assertFalse(WorkoutService.isGhostRacePayloadValid(1L, result));
    }
  }
}
