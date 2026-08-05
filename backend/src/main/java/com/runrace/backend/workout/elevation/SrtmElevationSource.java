package com.runrace.backend.workout.elevation;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import java.io.IOException;
import java.nio.ByteOrder;
import java.nio.MappedByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.Optional;
import java.util.stream.Stream;
import lombok.extern.slf4j.Slf4j;

/**
 * SRTM {@code .hgt} 타일에서 지형고를 읽는다.
 *
 * <p>포맷: 파일명 {@code N37E127.hgt}은 남서쪽 모서리를 뜻하고 위도 [37,38] · 경도 [127,128]을
 * 덮는다. 내용은 big-endian signed 16-bit 격자로, 1-arcsec는 3601×3601, 3-arcsec는 1201×1201.
 * <b>0행이 최북단</b>, 0열이 최서단이다. 빈 값(void)은 -32768.
 *
 * <p>타일은 {@link MappedByteBuffer}로 매핑해 캐시한다 — 1-arcsec 타일이 26MB라 힙에 통째로
 * 올리면 부담이지만, 매핑하면 실제 접근한 페이지만 올라온다. 절대 인덱스 {@code getShort(int)}만
 * 쓰므로 버퍼 position을 건드리지 않아 스레드 안전하다.
 */
@Slf4j
public class SrtmElevationSource implements TerrainElevationSource {

  /** SRTM void 표식. */
  private static final short VOID = -32768;
  /** 지형고로 볼 수 있는 범위(사해 -430m ~ 에베레스트 8849m)를 넉넉히 잡은 정합성 한계. */
  private static final int MIN_VALID_M = -500;
  private static final int MAX_VALID_M = 9000;
  static final int SRTM_3_ARCSEC_SAMPLES = 1201;
  static final int SRTM_1_ARCSEC_SAMPLES = 3601;
  private static final long SRTM_3_ARCSEC_BYTES = tileBytes(SRTM_3_ARCSEC_SAMPLES);
  private static final long SRTM_1_ARCSEC_BYTES = tileBytes(SRTM_1_ARCSEC_SAMPLES);
  private static final int DEFAULT_MAX_CACHED_TILES = 32;

  private final Path demDir;
  /** 타일명 → 매핑 버퍼. 값이 비어 있으면 "그 타일 파일이 없음"을 캐시한 것. */
  private final Cache<String, Optional<Tile>> tiles;

  public SrtmElevationSource(Path demDir) {
    this(demDir, DEFAULT_MAX_CACHED_TILES);
  }

  public SrtmElevationSource(Path demDir, int maxCachedTiles) {
    if (maxCachedTiles < 1) throw new IllegalArgumentException("maxCachedTiles must be positive");
    this.demDir = demDir;
    this.tiles = Caffeine.newBuilder().maximumSize(maxCachedTiles).build();
  }

  private record Tile(MappedByteBuffer buffer, int samplesPerSide) {}

  @Override
  public boolean isEnabled() {
    return true;
  }

  @Override
  public Double elevationAt(double lat, double lng) {
    if (!Double.isFinite(lat) || !Double.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

    int latBase = (int) Math.floor(lat);
    int lngBase = (int) Math.floor(lng);
    Tile tile = tiles
        .get(tileName(latBase, lngBase), this::loadTile)
        .orElse(null);
    if (tile == null) return null;

    int last = tile.samplesPerSide() - 1;
    // 0행이 최북단이므로 위도 진행 방향이 행 인덱스와 반대다.
    double row = (1 - (lat - latBase)) * last;
    double col = (lng - lngBase) * last;

    int r0 = clamp((int) Math.floor(row), last);
    int c0 = clamp((int) Math.floor(col), last);
    // 타일 동/북 끝에서는 이웃 샘플이 다음 타일에 있다. SRTM 타일은 가장자리 한 줄이
    // 이웃과 중복되도록 만들어져 있어, 클램프해도 같은 값을 읽는 것과 같다.
    int r1 = clamp(r0 + 1, last);
    int c1 = clamp(c0 + 1, last);

    double fr = row - Math.floor(row);
    double fc = col - Math.floor(col);

    Double v00 = sample(tile, r0, c0);
    Double v01 = sample(tile, r0, c1);
    Double v10 = sample(tile, r1, c0);
    Double v11 = sample(tile, r1, c1);

    return bilinear(v00, v01, v10, v11, fr, fc);
  }

  /**
   * 이중선형 보간. void 샘플은 가중치에서 빼고 남은 것으로 정규화한다 — 네 점이 모두 void일
   * 때만 값이 없다고 본다(바다·데이터 결손 지역).
   */
  private static Double bilinear(
      Double v00, Double v01, Double v10, Double v11, double fr, double fc) {
    double sum = 0;
    double weight = 0;
    double[][] corners = {
        {v00 == null ? Double.NaN : v00, (1 - fr) * (1 - fc)},
        {v01 == null ? Double.NaN : v01, (1 - fr) * fc},
        {v10 == null ? Double.NaN : v10, fr * (1 - fc)},
        {v11 == null ? Double.NaN : v11, fr * fc},
    };
    for (double[] corner : corners) {
      if (Double.isNaN(corner[0]) || corner[1] == 0) continue;
      sum += corner[0] * corner[1];
      weight += corner[1];
    }
    if (weight == 0) return null;
    return sum / weight;
  }

  private static int clamp(int value, int last) {
    return Math.max(0, Math.min(last, value));
  }

  private static Double sample(Tile tile, int row, int col) {
    int index = (row * tile.samplesPerSide() + col) * 2;
    short raw = tile.buffer().getShort(index);
    if (raw == VOID || raw < MIN_VALID_M || raw > MAX_VALID_M) return null;
    return (double) raw;
  }

  /** {@code N37E127} 형태의 타일명. 남/서반구는 floor 기준이라 -1.5도는 S02가 된다. */
  static String tileName(int latBase, int lngBase) {
    return String.format(
        "%s%02d%s%03d",
        latBase < 0 ? "S" : "N",
        Math.abs(latBase),
        lngBase < 0 ? "W" : "E",
        Math.abs(lngBase));
  }

  /** 설정된 디렉터리에 실제로 읽을 수 있는 SRTM 타일이 몇 개 있는지 시작 시 검증한다. */
  static long countUsableTiles(Path dir) {
    if (!Files.isDirectory(dir)) return 0;
    try (Stream<Path> files = Files.list(dir)) {
      return files.filter(SrtmElevationSource::isUsableTileFile).count();
    } catch (IOException | RuntimeException e) {
      log.warn("DEM 디렉터리 검사 실패: {}", dir, e);
      return 0;
    }
  }

  long cachedTileCount() {
    tiles.cleanUp();
    return tiles.estimatedSize();
  }

  private Optional<Tile> loadTile(String name) {
    Path file = tileFile(name);
    if (file == null) {
      log.debug("DEM 타일 없음: {}/{}.hgt", demDir, name);
      return Optional.empty();
    }
    try (FileChannel channel = FileChannel.open(file, StandardOpenOption.READ)) {
      long size = channel.size();
      int samplesPerSide = samplesPerSide(size);
      if (samplesPerSide == 0) {
        log.warn("지원하지 않는 DEM 타일 크기 — 건너뜀: {} ({} bytes)", file, size);
        return Optional.empty();
      }
      MappedByteBuffer buffer = channel.map(FileChannel.MapMode.READ_ONLY, 0, size);
      buffer.order(ByteOrder.BIG_ENDIAN);
      log.info("DEM 타일 로드: {} ({}×{})", name, samplesPerSide, samplesPerSide);
      return Optional.of(new Tile(buffer, samplesPerSide));
    } catch (IOException | RuntimeException e) {
      log.warn("DEM 타일 읽기 실패 — 건너뜀: {}", file, e);
      return Optional.empty();
    }
  }

  private Path tileFile(String name) {
    String lowerName = name.toLowerCase(java.util.Locale.ROOT);
    Path[] candidates = {
        demDir.resolve(name + ".hgt"),
        demDir.resolve(name + ".HGT"),
        demDir.resolve(lowerName + ".hgt"),
        demDir.resolve(lowerName + ".HGT")
    };
    for (Path candidate : candidates) {
      if (Files.isRegularFile(candidate)) return candidate;
    }
    return null;
  }

  private static boolean isUsableTileFile(Path file) {
    if (!Files.isRegularFile(file)) return false;
    String filename = file.getFileName().toString().toLowerCase(java.util.Locale.ROOT);
    if (!filename.matches("[ns]\\d{2}[ew]\\d{3}\\.hgt")) return false;
    try {
      return samplesPerSide(Files.size(file)) != 0;
    } catch (IOException | RuntimeException e) {
      return false;
    }
  }

  private static int samplesPerSide(long size) {
    if (size == SRTM_3_ARCSEC_BYTES) return SRTM_3_ARCSEC_SAMPLES;
    if (size == SRTM_1_ARCSEC_BYTES) return SRTM_1_ARCSEC_SAMPLES;
    return 0;
  }

  private static long tileBytes(int samplesPerSide) {
    return (long) samplesPerSide * samplesPerSide * Short.BYTES;
  }
}
