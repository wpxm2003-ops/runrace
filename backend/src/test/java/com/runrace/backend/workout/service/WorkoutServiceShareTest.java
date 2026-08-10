package com.runrace.backend.workout.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.runrace.backend.workout.dto.PathPointDto;
import java.util.List;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * 공유 페이지용 경로 절단({@link WorkoutService#toSharePath}) 회귀 잠금.
 * objectMapper만 실 구현으로 채우고 나머지 의존성은 null — toSharePath는 그 외 의존성을 쓰지 않는다.
 */
class WorkoutServiceShareTest {

  private final ObjectMapper objectMapper = new ObjectMapper();
  private final WorkoutService service =
      new WorkoutService(null, null, null, null, null, null, null, null, null, null, null, objectMapper, com.runrace.backend.workout.elevation.TerrainElevationSource.disabled());

  private String toJson(List<WorkoutService.PathPoint> points) {
    try {
      return objectMapper.writeValueAsString(points);
    } catch (JsonProcessingException e) {
      throw new IllegalStateException(e);
    }
  }

  @Nested class 경로_단절_마커_호환성 {
    @Test void breakBefore가_저장_JSON에서_응답까지_보존된다() {
      List<WorkoutService.PathPoint> original = List.of(
          new WorkoutService.PathPoint(37.0, 127.0, 0L),
          new WorkoutService.PathPoint(37.0005, 127.0, 1_000L, null, true));

      List<PathPointDto> result = service.toPath(toJson(original)).path();

      assertEquals(2, result.size());
      assertEquals(Boolean.TRUE, result.get(1).breakBefore());
      assertEquals(1_000L, result.get(1).t());
    }

    @Test void 일반_좌표에는_null_마커를_직렬화하지_않고_true만_저장한다() {
      String ordinary = toJson(List.of(new WorkoutService.PathPoint(37.0, 127.0, 0L)));
      String marked = toJson(List.of(
          new WorkoutService.PathPoint(37.0005, 127.0, 1_000L, null, true)));

      assertFalse(ordinary.contains("breakBefore"));
      assertTrue(marked.contains("\"breakBefore\":true"));
    }

    @Test void 구형_JSON에_breakBefore가_없으면_null로_읽는다() {
      List<PathPointDto> result =
          service.toPath("[{\"lat\":37.0,\"lng\":127.0,\"t\":0,\"ele\":null}]").path();

      assertEquals(1, result.size());
      assertEquals(null, result.get(0).breakBefore());
    }
  }

  @Nested class 긴_직선_경로 {
    // 위도만 0.001도(약 111m)씩 20개 점을 찍어 총 길이 약 2.1km 직선을 만든다.
    private final List<WorkoutService.PathPoint> original =
        java.util.stream.IntStream.range(0, 20)
            .mapToObj(i -> new WorkoutService.PathPoint(37.0 + i * 0.001, 127.0, (long) i))
            .toList();

    @Test void 시작과_끝이_잘리고_중간은_남는다() {
      List<PathPointDto> result = service.toSharePath(toJson(original)).path();

      assertTrue(result.size() < original.size(), "양 끝이 잘려 원본보다 짧아야 한다");
      assertTrue(result.size() > 0, "중간 구간은 남아야 한다");
      assertTrue(
          Math.abs(original.get(0).lat() - result.get(0).lat()) > 1e-9, "시작점이 잘려야 한다");
      assertTrue(
          Math.abs(original.get(original.size() - 1).lat() - result.get(result.size() - 1).lat())
              > 1e-9,
          "종료점이 잘려야 한다");

      // 명백히 중간인 지점(인덱스 10, 양 끝에서 약 1km 이상 떨어짐)은 남아 있어야 한다.
      boolean middleKept = result.stream().anyMatch(p -> Math.abs(p.lat() - 37.010) < 1e-9);
      assertTrue(middleKept, "중간 지점은 남아 있어야 한다");
    }
  }

  @Nested class 왕복_짧은_경로 {
    // 북쪽으로 200m 갔다가 그대로 되돌아오는 왕복 — 누적 이동 거리는 약 400m로 500m 미만이다.
    private final List<WorkoutService.PathPoint> original = List.of(
        new WorkoutService.PathPoint(37.0000, 127.0, 0L),
        new WorkoutService.PathPoint(37.0009, 127.0, 1L),
        new WorkoutService.PathPoint(37.0018, 127.0, 2L),
        new WorkoutService.PathPoint(37.0009, 127.0, 3L),
        new WorkoutService.PathPoint(37.0000, 127.0, 4L));

    @Test void 전체가_빈_경로가_된다() {
      List<PathPointDto> result = service.toSharePath(toJson(original)).path();
      assertEquals(List.of(), result);
    }
  }

  @Nested class 두점_미만_경로 {
    // 1점=사실상 시작·끝이 같은 지점이라 자를 앞뒤 구간이 없다 — 노출보다 빈 경로가 낫다.
    @Test void 한_점짜리_경로는_빈_경로가_된다() {
      List<WorkoutService.PathPoint> original =
          List.of(new WorkoutService.PathPoint(37.0, 127.0, 0L));
      List<PathPointDto> result = service.toSharePath(toJson(original)).path();
      assertEquals(List.of(), result);
    }

    @Test void 빈_경로는_그대로_반환한다() {
      List<PathPointDto> result = service.toSharePath(toJson(List.of())).path();
      assertEquals(List.of(), result);
    }
  }
}
