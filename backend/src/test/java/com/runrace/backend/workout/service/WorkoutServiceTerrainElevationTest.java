package com.runrace.backend.workout.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.runrace.backend.workout.elevation.ElevationSource;
import com.runrace.backend.workout.elevation.TerrainElevationSource;
import java.util.List;
import org.junit.jupiter.api.Test;

/** 원본 저장과 조회 시 전체 경로 지형고 교체 규칙. */
class WorkoutServiceTerrainElevationTest {

  private static WorkoutService serviceWith(TerrainElevationSource source) {
    return new WorkoutService(
        null, null, null, null, null, null, null, null, null, null, null,
        new ObjectMapper(), source);
  }

  /** 위도에 비례한 고도를 주는 가짜 지형 — 좌표별로 다른 값이 실제로 실리는지 확인용. */
  private static TerrainElevationSource fakeTerrain() {
    return new TerrainElevationSource() {
      @Override
      public Double elevationAt(double lat, double lng) {
        return (lat - 37.0) * 10_000;
      }

      @Override
      public boolean isEnabled() {
        return true;
      }
    };
  }

  @Test
  void GPS_고도를_좌표_기준_지형고로_교체한다() {
    WorkoutService service = serviceWith(fakeTerrain());
    List<WorkoutService.PathPoint> path = List.of(
        new WorkoutService.PathPoint(37.0000, 127.0, 0L, 999.0),
        new WorkoutService.PathPoint(37.0010, 127.0, 1_000L, 999.0),
        new WorkoutService.PathPoint(37.0020, 127.0, 2_000L, 999.0));

    List<WorkoutService.PathPoint> result = service.withTerrainElevation(path).points();

    // GPS가 준 999m는 모두 버려지고 좌표 기준 지형고가 들어간다.
    // (위경도 뺄셈의 부동소수 오차가 있어 근사 비교)
    assertThat(result).extracting(WorkoutService.PathPoint::ele)
        .usingComparatorForType((a, b) -> Math.abs(a - b) < 1e-6 ? 0 : Double.compare(a, b), Double.class)
        .containsExactly(0.0, 10.0, 20.0);
    // 좌표·시각·단절 마커는 건드리지 않는다.
    assertThat(result).extracting(WorkoutService.PathPoint::lat)
        .containsExactly(37.0000, 37.0010, 37.0020);
    assertThat(result).extracting(WorkoutService.PathPoint::t)
        .containsExactly(0L, 1_000L, 2_000L);
  }

  @Test
  void 소스가_비활성이면_GPS_고도를_그대로_둔다() {
    WorkoutService service = serviceWith(TerrainElevationSource.disabled());
    List<WorkoutService.PathPoint> path = List.of(
        new WorkoutService.PathPoint(37.0, 127.0, 0L, 999.0));

    assertThat(service.withTerrainElevation(path).points())
        .extracting(WorkoutService.PathPoint::ele)
        .containsExactly(999.0);
  }

  @Test
  void 한_좌표라도_타일이_없으면_경로_전체를_GPS_고도로_유지한다() {
    // 위도 38 이상은 데이터 없음을 흉내낸다.
    TerrainElevationSource partial = new TerrainElevationSource() {
      @Override
      public Double elevationAt(double lat, double lng) {
        return lat >= 38.0 ? null : 50.0;
      }

      @Override
      public boolean isEnabled() {
        return true;
      }
    };
    WorkoutService service = serviceWith(partial);
    List<WorkoutService.PathPoint> path = List.of(
        new WorkoutService.PathPoint(37.5, 127.0, 0L, 999.0),
        new WorkoutService.PathPoint(38.5, 127.0, 1_000L, 888.0));

    assertThat(service.withTerrainElevation(path).points())
        .extracting(WorkoutService.PathPoint::ele)
        .containsExactly(999.0, 888.0);
  }

  @Test
  void DEM_조회가_실패해도_경로_전체를_GPS_고도로_유지한다() {
    TerrainElevationSource broken = new TerrainElevationSource() {
      @Override
      public Double elevationAt(double lat, double lng) {
        throw new IllegalStateException("broken tile");
      }

      @Override
      public boolean isEnabled() {
        return true;
      }
    };
    WorkoutService service = serviceWith(broken);
    List<WorkoutService.PathPoint> path = List.of(
        new WorkoutService.PathPoint(37.5, 127.0, 0L, 123.0));

    assertThat(service.withTerrainElevation(path).points())
        .extracting(WorkoutService.PathPoint::ele)
        .containsExactly(123.0);
  }

  @Test
  void 저장_JSON에는_DEM이_아닌_GPS_원본을_남긴다() throws Exception {
    WorkoutService service = serviceWith(fakeTerrain());
    List<WorkoutService.PathPoint> path = List.of(
        new WorkoutService.PathPoint(37.001, 127.0, 0L, 999.0));

    String json = service.toJson(path);

    assertThat(new ObjectMapper().readTree(json).get(0).get("ele").doubleValue())
        .isEqualTo(999.0);
  }

  @Test
  void 기존_저장_JSON도_조회할_때_DEM으로_보정한다() {
    WorkoutService service = serviceWith(fakeTerrain());

    assertThat(service.toPath("[{\"lat\":37.001,\"lng\":127.0,\"t\":0,\"ele\":999.0}]").path())
        .extracting(com.runrace.backend.workout.dto.PathPointDto::ele)
        .containsExactly(10.0);
  }

  @Test
  void 단절_마커는_교체_후에도_보존된다() {
    WorkoutService service = serviceWith(fakeTerrain());
    List<WorkoutService.PathPoint> path = List.of(
        new WorkoutService.PathPoint(37.0, 127.0, 0L, 999.0, null),
        new WorkoutService.PathPoint(37.001, 127.0, 1_000L, 999.0, true));

    assertThat(service.withTerrainElevation(path).points())
        .extracting(WorkoutService.PathPoint::breakBefore)
        .containsExactly(null, true);
  }

  @Test
  void 빈_경로는_그대로_돌려준다() {
    WorkoutService service = serviceWith(fakeTerrain());
    assertThat(service.withTerrainElevation(List.of()).points()).isEmpty();
  }

  // ── 고도 출처 보고 ────────────────────────────────────────────────────────
  // 클라이언트는 값만 봐서는 DEM인지 GPS인지 알 수 없다. 출처를 틀리게 보고하면
  // 믿을 수 없는 GPS 고도를 그대로 차트로 그리게 된다.

  @Test
  void 전_구간_교체에_성공하면_출처는_DEM이다() {
    WorkoutService service = serviceWith(fakeTerrain());
    List<WorkoutService.PathPoint> path = List.of(
        new WorkoutService.PathPoint(37.001, 127.0, 0L, 999.0));

    assertThat(service.withTerrainElevation(path).elevationSource())
        .isEqualTo(ElevationSource.DEM);
  }

  @Test
  void GPS로_폴백하면_출처는_GPS다() {
    TerrainElevationSource partial = new TerrainElevationSource() {
      @Override
      public Double elevationAt(double lat, double lng) {
        return lat >= 38.0 ? null : 50.0;
      }

      @Override
      public boolean isEnabled() {
        return true;
      }
    };
    WorkoutService service = serviceWith(partial);
    List<WorkoutService.PathPoint> path = List.of(
        new WorkoutService.PathPoint(37.5, 127.0, 0L, 999.0),
        new WorkoutService.PathPoint(38.5, 127.0, 1_000L, 888.0));

    assertThat(service.withTerrainElevation(path).elevationSource())
        .isEqualTo(ElevationSource.GPS);
  }

  @Test
  void 소스가_비활성이면_출처는_GPS다() {
    WorkoutService service = serviceWith(TerrainElevationSource.disabled());
    List<WorkoutService.PathPoint> path = List.of(
        new WorkoutService.PathPoint(37.0, 127.0, 0L, 999.0));

    assertThat(service.withTerrainElevation(path).elevationSource())
        .isEqualTo(ElevationSource.GPS);
  }

  @Test
  void 원본에_고도가_아예_없으면_출처는_NONE이다() {
    // 실내 러닝이나, 수직 정확도 게이트에 걸려 고도가 안 실린 과거 기록.
    WorkoutService service = serviceWith(TerrainElevationSource.disabled());
    List<WorkoutService.PathPoint> path = List.of(
        new WorkoutService.PathPoint(37.0, 127.0, 0L, null));

    assertThat(service.withTerrainElevation(path).elevationSource())
        .isEqualTo(ElevationSource.NONE);
  }

  @Test
  void 빈_경로의_출처는_NONE이다() {
    WorkoutService service = serviceWith(fakeTerrain());
    assertThat(service.withTerrainElevation(List.of()).elevationSource())
        .isEqualTo(ElevationSource.NONE);
  }

  @Test
  void DEM_조회_실패_시에도_출처는_DEM이_아니다() {
    TerrainElevationSource broken = new TerrainElevationSource() {
      @Override
      public Double elevationAt(double lat, double lng) {
        throw new IllegalStateException("broken tile");
      }

      @Override
      public boolean isEnabled() {
        return true;
      }
    };
    WorkoutService service = serviceWith(broken);
    List<WorkoutService.PathPoint> path = List.of(
        new WorkoutService.PathPoint(37.5, 127.0, 0L, 123.0));

    assertThat(service.withTerrainElevation(path).elevationSource())
        .isEqualTo(ElevationSource.GPS);
  }

  @Test
  void 응답_경로에도_출처가_실린다() {
    WorkoutService service = serviceWith(fakeTerrain());

    assertThat(service.toPath("[{\"lat\":37.001,\"lng\":127.0,\"t\":0,\"ele\":999.0}]")
        .elevationSource()).isEqualTo(ElevationSource.DEM);
  }
}
