package com.runrace.backend.common;

import java.math.BigDecimal;
import java.math.RoundingMode;

/** 거리 단위 변환의 단일 출처 — 미터→킬로미터(소수 3자리, 반올림 정책 통일). */
public final class Distance {
  /** km 환산 소수 자릿수. */
  public static final int KM_SCALE = 3;

  /**
   * 한 건의 운동으로 인정하는 거리 상한(m) — 비정상/조작 값 차단(치팅·메모리 DoS 방지).
   * 확정 저장(WorkoutService)과 라이브 진행률 핑이 같은 기준을 쓰도록 여기에 둔다.
   */
  public static final int MAX_DISTANCE_M = 300_000; // 300km

  /** 한 건의 운동으로 인정하는 활동 시간 상한(초). 거리 상한과 같은 이유로 공유한다. */
  public static final int MAX_DURATION_SEC = 36 * 3600; // 36h

  private static final BigDecimal METERS_PER_KM = BigDecimal.valueOf(1000);

  private Distance() {}

  public static BigDecimal toKm(long meters) {
    return BigDecimal.valueOf(meters).divide(METERS_PER_KM, KM_SCALE, RoundingMode.HALF_UP);
  }

  /** km→미터(반올림 정수). {@link #toKm}의 역변환 — 라이벌 갭 등 m 단위 응답 계산용. */
  public static long toM(BigDecimal km) {
    return km.multiply(METERS_PER_KM).setScale(0, RoundingMode.HALF_UP).longValueExact();
  }
}
