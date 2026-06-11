package com.runrace.backend.common;

import java.util.Set;

/** 지원 언어 코드의 단일 출처 — 사용자/대결 언어 검증·정규화에 사용한다. */
public final class SupportedLanguages {
  /** 미지원·미상 언어의 기본값. */
  public static final String DEFAULT = "ko";

  private static final Set<String> CODES = Set.of("ko", "en", "es", "ja", "zh");

  private SupportedLanguages() {}

  public static boolean isSupported(String langCd) {
    return langCd != null && CODES.contains(langCd);
  }

  /** 지원 언어면 그대로, 아니면 {@link #DEFAULT}를 반환한다. */
  public static String normalizeOrDefault(String langCd) {
    return isSupported(langCd) ? langCd : DEFAULT;
  }
}
