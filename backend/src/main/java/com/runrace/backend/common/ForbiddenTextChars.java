package com.runrace.backend.common;

import java.util.regex.Pattern;

/** 사용자 입력 텍스트에서 SQL·스크립트에 취약한 문자만 검사한다 (그 외 특수문자는 허용). */
public final class ForbiddenTextChars {
  private static final Pattern FORBIDDEN =
      Pattern.compile("[\"';\\\\`<>\\p{Cntrl}]");

  private ForbiddenTextChars() {}

  public static boolean containsForbidden(String value) {
    return value != null && FORBIDDEN.matcher(value).find();
  }
}
