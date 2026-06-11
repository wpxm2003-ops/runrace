package com.runrace.backend.common;

import java.math.BigDecimal;
import java.math.RoundingMode;

/** 거리 단위 변환의 단일 출처 — 미터→킬로미터(소수 3자리, 반올림 정책 통일). */
public final class Distance {
  /** km 환산 소수 자릿수. */
  public static final int KM_SCALE = 3;

  private static final BigDecimal METERS_PER_KM = BigDecimal.valueOf(1000);

  private Distance() {}

  public static BigDecimal toKm(long meters) {
    return BigDecimal.valueOf(meters).divide(METERS_PER_KM, KM_SCALE, RoundingMode.HALF_UP);
  }
}
