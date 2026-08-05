package com.runrace.backend.workout.elevation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class SrtmElevationSourceTest {

  /** 3-arcsec 타일 한 변의 샘플 수. */
  private static final int SIDE = 1201;

  /**
   * 합성 .hgt 타일 생성. {@code value(row, col)}이 각 격자점의 고도(m)를 준다.
   * 실제 포맷대로 big-endian int16, 0행이 최북단, 행 우선으로 쓴다.
   */
  private static void writeTile(Path dir, String name, ValueFn value) throws IOException {
    ByteBuffer buffer = ByteBuffer.allocate(SIDE * SIDE * 2).order(ByteOrder.BIG_ENDIAN);
    for (int row = 0; row < SIDE; row++) {
      for (int col = 0; col < SIDE; col++) {
        buffer.putShort((short) value.at(row, col));
      }
    }
    Files.write(dir.resolve(name + ".hgt"), buffer.array());
  }

  private interface ValueFn {
    int at(int row, int col);
  }

  @Test
  void 평평한_타일은_어디를_찍어도_같은_고도를_준다(@TempDir Path dir) throws IOException {
    writeTile(dir, "N37E127", (row, col) -> 42);
    SrtmElevationSource source = new SrtmElevationSource(dir);

    assertThat(source.elevationAt(37.5, 127.5)).isEqualTo(42.0);
    // 타일 남서쪽 모서리 — 이 타일에 속한다.
    assertThat(source.elevationAt(37.0, 127.0)).isEqualTo(42.0);
    // 타일 북동쪽 끝 직전 — 이웃 샘플이 격자 밖이라 클램프 경로를 탄다.
    assertThat(source.elevationAt(37.9999, 127.9999)).isEqualTo(42.0);
  }

  @Test
  void 타일_상단_경계_좌표는_이웃_타일_소관이다(@TempDir Path dir) throws IOException {
    writeTile(dir, "N37E127", (row, col) -> 42);
    SrtmElevationSource source = new SrtmElevationSource(dir);

    // 위도 38.0은 floor 기준으로 N38E127, 경도 128.0은 E128에 속한다. 실제 DEM 세트라면
    // 이웃 타일이 있어서 값이 나오지만, 없으면 null이 맞다 — 엉뚱한 타일에서 읽으면 안 된다.
    assertThat(source.elevationAt(38.0, 127.5)).isNull();
    assertThat(source.elevationAt(37.5, 128.0)).isNull();
  }

  @Test
  void 남북_경사가_행_방향과_반대로_해석된다(@TempDir Path dir) throws IOException {
    // 0행(최북단)이 1200m, 마지막 행(최남단)이 0m — 북쪽이 높다.
    writeTile(dir, "N37E127", (row, col) -> SIDE - 1 - row);
    SrtmElevationSource source = new SrtmElevationSource(dir);

    Double north = source.elevationAt(37.9999, 127.5);
    Double south = source.elevationAt(37.0, 127.5);
    Double middle = source.elevationAt(37.5, 127.5);

    assertThat(north).isCloseTo(1200.0, within(1.0));
    assertThat(south).isEqualTo(0.0);
    // 위도가 북으로 갈수록 고도가 올라가야 한다(행 인덱스를 뒤집지 않으면 반대로 나온다).
    assertThat(middle).isCloseTo(600.0, within(1.0));
  }

  @Test
  void 동서_경사는_열_방향과_같은_향이다(@TempDir Path dir) throws IOException {
    writeTile(dir, "N37E127", (row, col) -> col);
    SrtmElevationSource source = new SrtmElevationSource(dir);

    assertThat(source.elevationAt(37.5, 127.0)).isEqualTo(0.0);
    assertThat(source.elevationAt(37.5, 127.9999)).isCloseTo(1200.0, within(1.0));
  }

  @Test
  void 격자_사이_지점은_이중선형으로_보간된다(@TempDir Path dir) throws IOException {
    writeTile(dir, "N37E127", (row, col) -> col);
    SrtmElevationSource source = new SrtmElevationSource(dir);

    // 정확히 격자 반 칸(0.5 샘플) 지점 → 두 이웃의 중간값이어야 한다.
    double halfSample = 0.5 / (SIDE - 1);
    assertThat(source.elevationAt(37.5, 127.0 + halfSample)).isCloseTo(0.5, within(0.01));
  }

  @Test
  void void_샘플은_유효한_이웃만으로_보간한다(@TempDir Path dir) throws IOException {
    // 서쪽 절반이 void(바다), 동쪽 절반이 100m
    writeTile(dir, "N37E127", (row, col) -> col < SIDE / 2 ? -32768 : 100);
    SrtmElevationSource source = new SrtmElevationSource(dir);

    assertThat(source.elevationAt(37.5, 127.9)).isEqualTo(100.0);
    // 네 점이 모두 void인 곳은 값 없음
    assertThat(source.elevationAt(37.5, 127.1)).isNull();
  }

  @Test
  void 타일이_없으면_null(@TempDir Path dir) {
    SrtmElevationSource source = new SrtmElevationSource(dir);
    assertThat(source.elevationAt(37.5, 127.5)).isNull();
  }

  @Test
  void 깨진_타일은_건너뛰고_null(@TempDir Path dir) throws IOException {
    Files.write(dir.resolve("N37E127.hgt"), new byte[] {1, 2, 3});
    SrtmElevationSource source = new SrtmElevationSource(dir);
    assertThat(source.elevationAt(37.5, 127.5)).isNull();
  }

  @Test
  void 정사각형이어도_SRTM_공식_해상도가_아니면_거부한다(@TempDir Path dir)
      throws IOException {
    // 기존 검사는 2x2처럼 우연히 정사각형인 손상 파일을 정상 타일로 받아들였다.
    Files.write(dir.resolve("N37E127.hgt"), new byte[2 * 2 * Short.BYTES]);
    SrtmElevationSource source = new SrtmElevationSource(dir);

    assertThat(source.elevationAt(37.5, 127.5)).isNull();
  }

  @Test
  void 빈_타일도_예외_없이_거부한다(@TempDir Path dir) throws IOException {
    Files.createFile(dir.resolve("N37E127.hgt"));
    SrtmElevationSource source = new SrtmElevationSource(dir);

    assertThat(source.elevationAt(37.5, 127.5)).isNull();
  }

  @Test
  void 타일_캐시는_설정한_상한을_넘지_않는다(@TempDir Path dir) throws IOException {
    writeTile(dir, "N37E127", (row, col) -> 10);
    writeTile(dir, "N37E128", (row, col) -> 20);
    writeTile(dir, "N38E127", (row, col) -> 30);
    SrtmElevationSource source = new SrtmElevationSource(dir, 2);

    assertThat(source.elevationAt(37.5, 127.5)).isEqualTo(10.0);
    assertThat(source.elevationAt(37.5, 128.5)).isEqualTo(20.0);
    assertThat(source.elevationAt(38.5, 127.5)).isEqualTo(30.0);
    assertThat(source.cachedTileCount()).isLessThanOrEqualTo(2);
  }

  @Test
  void 시작_검사는_정상_이름과_크기의_타일만_센다(@TempDir Path dir) throws IOException {
    writeTile(dir, "N37E127", (row, col) -> 42);
    Files.write(dir.resolve("N37E128.hgt"), new byte[] {1, 2, 3});
    Files.write(dir.resolve("not-a-tile.hgt"), new byte[SIDE * SIDE * Short.BYTES]);

    assertThat(SrtmElevationSource.countUsableTiles(dir)).isEqualTo(1);
  }

  @Test
  void 리눅스에서도_타일명_대소문자_차이를_허용한다(@TempDir Path dir) throws IOException {
    writeTile(dir, "N37E127", (row, col) -> 42);
    Files.move(dir.resolve("N37E127.hgt"), dir.resolve("n37e127.HGT"));
    SrtmElevationSource source = new SrtmElevationSource(dir);

    assertThat(source.elevationAt(37.5, 127.5)).isEqualTo(42.0);
  }

  @Test
  void 타일명은_floor_기준이라_남서반구도_맞는다() {
    assertThat(SrtmElevationSource.tileName(37, 127)).isEqualTo("N37E127");
    assertThat(SrtmElevationSource.tileName(0, 0)).isEqualTo("N00E000");
    // -1.5도 → floor = -2 → S02
    assertThat(SrtmElevationSource.tileName(-2, -1)).isEqualTo("S02W001");
  }

  @Test
  void 비활성_소스는_항상_null이고_disabled를_보고한다() {
    TerrainElevationSource disabled = TerrainElevationSource.disabled();
    assertThat(disabled.isEnabled()).isFalse();
    assertThat(disabled.elevationAt(37.5, 127.5)).isNull();
  }
}
