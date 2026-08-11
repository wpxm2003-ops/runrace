package com.runrace.backend.workout.service;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;

/**
 * 기기 벽시계 박제(패턴 A) 규칙 — 잔디·스트릭·달력의 날짜가 전부 이 값에서 나오므로,
 * 여기가 틀리면 사용자 눈에 "하루 밀린 기록"으로 보인다.
 */
class StartedAtLocalTest {

  private static final OffsetDateTime UTC_NOON =
      OffsetDateTime.parse("2026-08-11T12:00:00Z");

  @Test
  void 정상_벽시계는_그대로_박제된다() {
    // 마닐라(UTC+8) 저녁 8시 런 — KST로 밀면 9시가 되지만, 기기 벽시계 그대로 남아야 한다.
    assertEquals(
        LocalDateTime.parse("2026-08-11T20:00:00"),
        WorkoutService.resolveStartedAtLocal("2026-08-11T20:00:00", UTC_NOON));
  }

  @Test
  void 날짜가_다른_서반구_벽시계도_그대로다() {
    // 뉴욕(UTC-4) 저녁 8시 런은 UTC로 다음날 자정 — 로컬 날짜는 전날로 남아야 한다.
    OffsetDateTime utc = OffsetDateTime.parse("2026-08-12T00:00:00Z");
    assertEquals(
        LocalDateTime.parse("2026-08-11T20:00:00"),
        WorkoutService.resolveStartedAtLocal("2026-08-11T20:00:00", utc));
  }

  @Test
  void 없으면_KST_변환_폴백_구클라이언트_하위호환() {
    assertEquals(
        LocalDateTime.parse("2026-08-11T21:00:00"),
        WorkoutService.resolveStartedAtLocal(null, UTC_NOON));
    assertEquals(
        LocalDateTime.parse("2026-08-11T21:00:00"),
        WorkoutService.resolveStartedAtLocal("  ", UTC_NOON));
  }

  @Test
  void 형식이_틀리면_KST_폴백() {
    assertEquals(
        LocalDateTime.parse("2026-08-11T21:00:00"),
        WorkoutService.resolveStartedAtLocal("어제 저녁", UTC_NOON));
    // 오프셋이 붙은 값도 벽시계 형식이 아니므로 폴백
    assertEquals(
        LocalDateTime.parse("2026-08-11T21:00:00"),
        WorkoutService.resolveStartedAtLocal("2026-08-11T20:00:00+08:00", UTC_NOON));
  }

  @Test
  void 실존_오프셋_범위를_벗어난_벽시계는_조작으로_보고_KST_폴백() {
    // UTC 정오인데 벽시계가 다음날 새벽 4시 = +16h — 존재하지 않는 시간대.
    // 스트릭·잔디 날짜를 꾸미는 조작을 막는다.
    assertEquals(
        LocalDateTime.parse("2026-08-11T21:00:00"),
        WorkoutService.resolveStartedAtLocal("2026-08-12T04:00:00", UTC_NOON));
    // -13h도 실존하지 않음
    assertEquals(
        LocalDateTime.parse("2026-08-11T21:00:00"),
        WorkoutService.resolveStartedAtLocal("2026-08-10T23:00:00", UTC_NOON));
  }

  @Test
  void 오프셋_경계값은_통과한다() {
    // UTC+14(키리바시)와 UTC-12는 실존 — 경계 포함이어야 한다.
    assertEquals(
        LocalDateTime.parse("2026-08-12T02:00:00"),
        WorkoutService.resolveStartedAtLocal("2026-08-12T02:00:00", UTC_NOON));
    assertEquals(
        LocalDateTime.parse("2026-08-11T00:00:00"),
        WorkoutService.resolveStartedAtLocal("2026-08-11T00:00:00", UTC_NOON));
  }
}
