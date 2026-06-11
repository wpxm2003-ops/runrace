package com.runrace.backend.common;

import java.nio.charset.StandardCharsets;

/**
 * 사용자 입력 텍스트 검증의 단일 출처 — 트림 후 비어있음·길이 초과·금지문자를 거른다.
 * 호출부는 길이 한도와 에러 코드 접두사만 지정한다(닉네임·레이스 제목 등).
 */
public final class TextValidation {
  private TextValidation() {}

  /**
   * 트림한 텍스트를 반환하거나, 검증 실패 시 {@link ApiException}(400)을 던진다.
   *
   * @param byteLimit true면 UTF-8 바이트 길이로, false면 문자 수로 {@code maxLen}을 검사한다.
   * @param codePrefix 에러 코드 접두사 — 빈값·길이초과는 {@code "invalid_{prefix}"},
   *     금지문자는 {@code "invalid_{prefix}_chars"}.
   */
  public static String requireCleanText(String raw, int maxLen, boolean byteLimit, String codePrefix) {
    String trimmed = raw == null ? "" : raw.trim();
    int length = byteLimit ? trimmed.getBytes(StandardCharsets.UTF_8).length : trimmed.length();
    if (trimmed.isBlank() || length > maxLen) {
      throw ApiException.badRequest("invalid_" + codePrefix);
    }
    if (ForbiddenTextChars.containsForbidden(trimmed)) {
      throw ApiException.badRequest("invalid_" + codePrefix + "_chars");
    }
    return trimmed;
  }
}
