package com.runrace.backend.workout.dto;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.runrace.backend.workout.domain.WorkoutSession;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * 공유 응답의 시각 정밀도 저하({@link WorkoutShareResponse#from}) 회귀 잠금.
 * 정확한 시·분·초는 거주지·생활 패턴 추론에 쓰일 수 있어 시(hour) 단위로만 내려준다.
 */
class WorkoutShareResponseTest {

  @Test void 시작_시각을_정시로_내려준다() {
    WorkoutSession session = WorkoutSession.builder()
        .startedAt(OffsetDateTime.parse("2026-07-29T14:37:22Z"))
        .durationSec(1800)
        .distanceM(5000)
        .calories(300)
        .avgPaceSecPerKm(360)
        .pathJson("[]")
        .build();

    WorkoutShareResponse response = WorkoutShareResponse.from(session, List.of(), com.runrace.backend.workout.elevation.ElevationSource.NONE);

    assertEquals("2026-07-29T14:00Z", response.startedAt());
  }

  @Test void 정시_시작이면_변화_없이_그대로_정시다() {
    WorkoutSession session = WorkoutSession.builder()
        .startedAt(OffsetDateTime.parse("2026-07-29T09:00:00Z"))
        .durationSec(600)
        .distanceM(2000)
        .calories(100)
        .pathJson("[]")
        .build();

    WorkoutShareResponse response = WorkoutShareResponse.from(session, List.of(), com.runrace.backend.workout.elevation.ElevationSource.NONE);

    assertEquals("2026-07-29T09:00Z", response.startedAt());
  }
}
