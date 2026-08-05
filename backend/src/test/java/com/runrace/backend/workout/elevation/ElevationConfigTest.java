package com.runrace.backend.workout.elevation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ElevationConfigTest {

  private final ElevationConfig config = new ElevationConfig();

  @Test
  void 선택_모드에서는_경로가_없으면_GPS로_폴백한다() {
    TerrainElevationSource source = config.terrainElevationSource("", false, 32);

    assertThat(source.isEnabled()).isFalse();
  }

  @Test
  void 필수_모드에서는_경로가_없으면_기동을_막는다() {
    assertThatThrownBy(() -> config.terrainElevationSource("", true, 32))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("DEM 경로 미설정");
  }

  @Test
  void 필수_모드에서는_빈_디렉터리도_기동을_막는다(@TempDir Path dir) {
    assertThatThrownBy(() -> config.terrainElevationSource(dir.toString(), true, 32))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("지원되는 DEM 타일이 없음");
  }

  @Test
  void 정상_타일이_있으면_소스를_활성화한다(@TempDir Path dir) throws IOException {
    int side = SrtmElevationSource.SRTM_3_ARCSEC_SAMPLES;
    Files.write(dir.resolve("N37E127.hgt"), new byte[side * side * Short.BYTES]);

    TerrainElevationSource source = config.terrainElevationSource(dir.toString(), true, 2);

    assertThat(source.isEnabled()).isTrue();
    assertThat(source.elevationAt(37.5, 127.5)).isEqualTo(0.0);
  }
}
