package com.runrace.backend.workout.elevation;

import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 지형고 소스 배선.
 *
 * <p>{@code runrace.elevation.dem-dir}가 비어 있거나 존재하지 않는 경로면 비활성 소스를 쓴다 —
 * 타일을 아직 안 깔았거나 로컬 개발 중이어도 저장이 깨지지 않고, 그때는 기존 GPS 고도가
 * 그대로 유지된다.
 */
@Slf4j
@Configuration
public class ElevationConfig {

  @Bean
  public TerrainElevationSource terrainElevationSource(
      @Value("${runrace.elevation.dem-dir:}") String demDir,
      @Value("${runrace.elevation.required:false}") boolean required,
      @Value("${runrace.elevation.max-cached-tiles:32}") int maxCachedTiles) {
    if (maxCachedTiles < 1) {
      throw new IllegalStateException("runrace.elevation.max-cached-tiles must be positive");
    }
    if (demDir == null || demDir.isBlank()) {
      return unavailable(required, "DEM 경로 미설정 — 지형고 보정 비활성(GPS 고도 유지)");
    }
    Path dir;
    try {
      dir = Path.of(demDir).toAbsolutePath().normalize();
    } catch (InvalidPathException e) {
      return unavailable(required, "DEM 경로가 올바르지 않음: " + demDir);
    }
    if (!Files.isDirectory(dir)) {
      return unavailable(required, "DEM 경로가 디렉터리가 아님 — 지형고 보정 비활성: " + dir);
    }
    long tileCount = SrtmElevationSource.countUsableTiles(dir);
    if (tileCount == 0) {
      return unavailable(required, "지원되는 DEM 타일이 없음 — 지형고 보정 비활성: " + dir);
    }
    log.info("DEM 지형고 보정 활성: {} (타일 {}개, 캐시 최대 {}개)", dir, tileCount, maxCachedTiles);
    return new SrtmElevationSource(dir, maxCachedTiles);
  }

  private TerrainElevationSource unavailable(boolean required, String message) {
    if (required) throw new IllegalStateException(message);
    log.warn(message);
    return TerrainElevationSource.disabled();
  }
}
