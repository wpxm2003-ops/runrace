package com.runrace.backend.common;

import java.time.OffsetDateTime;

/** {@link OffsetDateTime} → ISO-8601 문자열 직렬화의 단일 출처(응답 DTO 공통). */
public final class IsoTime {
  private IsoTime() {}

  public static String format(OffsetDateTime value) {
    return value.toString();
  }

  public static String formatOrNull(OffsetDateTime value) {
    return value != null ? value.toString() : null;
  }
}
