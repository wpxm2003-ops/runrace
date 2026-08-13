package com.runrace.backend.common;

import java.util.regex.Pattern;

/**
 * 사용자 입력 텍스트에서 SQL·스크립트에 취약한 문자만 검사한다 (그 외 특수문자는 허용).
 * 프론트 forbiddenTextChars.ts 와 의미를 맞춰야 한다 — 수정 시 양쪽 함께.
 * 제어문자는 유니코드 Cc 범주(\p{Cc})로 검사한다 — POSIX \p{Cntrl}은 US-ASCII 한정이라
 * C1 제어문자(U+0080~U+009F)를 통과시켜 프론트(\p{Cc})와 어긋난다.
 */
public final class ForbiddenTextChars {
  private static final Pattern FORBIDDEN =
      Pattern.compile("[\"';\\\\`<>\\p{Cc}]");

  private ForbiddenTextChars() {}

  public static boolean containsForbidden(String value) {
    return value != null && FORBIDDEN.matcher(value).find();
  }
}
