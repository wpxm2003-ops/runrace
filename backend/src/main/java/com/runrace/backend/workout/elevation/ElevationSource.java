package com.runrace.backend.workout.elevation;

/**
 * 응답에 실린 고도가 어디서 온 값인지.
 *
 * <p>클라이언트가 고도를 표시할지 판단하는 근거다. GPS 원본은 지형과 오차를 구분할 수 없어
 * (자세한 근거는 {@link TerrainElevationSource}) 차트로 보여줄 수 없다. 출처를 알려주지 않으면
 * 클라이언트는 믿을 수 있는 값과 없는 값을 똑같이 그리게 된다.
 */
public enum ElevationSource {
  /** 전 구간이 DEM 지형고로 교체됐다 — 표시 가능. */
  DEM,
  /** DEM을 적용하지 못해 GPS 원본이 그대로다 — 표시 불가. */
  GPS,
  /** 고도 값이 아예 없다(실내 러닝, 고도 미수집 기록). */
  NONE
}
