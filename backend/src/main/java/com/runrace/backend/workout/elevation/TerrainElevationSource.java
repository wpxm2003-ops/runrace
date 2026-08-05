package com.runrace.backend.workout.elevation;

/**
 * 좌표의 지형 고도(해발, m)를 돌려주는 소스.
 *
 * <p>GPS가 보고하는 고도는 이 앱의 용도에 쓸 수 없다. 폰 GNSS의 수직 오차는 수평의 2~3배이고,
 * 그 오차의 지배적 성분이 백색잡음이 아니라 상관시간 수십~수백 초짜리 느린 드리프트라서
 * 중앙값·이동평균 어떤 필터로도 지형과 구분되지 않는다. 실측 시뮬레이션에서 완전한 평지
 * 10분 걷기가 7~31m 언덕으로 그려졌고, 진짜 6m 딥이 있는 경로와 평지의 차이는 1m 미만이었다.
 *
 * <p>그래서 상세 조회 시 좌표 기준으로 지형고를 조회해 GPS 고도를 대체한다. 저장소에는 원본을
 * 남겨 데이터셋을 교체하거나 보정을 끄더라도 복구할 수 있게 한다. 같은 코스는 같은 프로필이
 * 나오고, 평지는 평지로 나온다.
 *
 * <p>한계: 지표면(bare-earth) 고도이므로 지하보도·굴다리·육교·실내 계단은 반영되지 않는다.
 */
public interface TerrainElevationSource {

  /**
   * @return 해당 좌표의 해발고도(m). 데이터가 없거나 소스가 비활성이면 {@code null}.
   */
  Double elevationAt(double lat, double lng);

  /** 소스가 실제로 값을 돌려줄 수 있는 상태인지. 비활성이면 호출부는 기존 GPS 고도를 유지한다. */
  boolean isEnabled();

  /** 데이터 경로가 설정되지 않았을 때 쓰는 비활성 소스. */
  static TerrainElevationSource disabled() {
    return new TerrainElevationSource() {
      @Override
      public Double elevationAt(double lat, double lng) {
        return null;
      }

      @Override
      public boolean isEnabled() {
        return false;
      }
    };
  }
}
