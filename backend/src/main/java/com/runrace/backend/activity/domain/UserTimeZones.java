package com.runrace.backend.activity.domain;

import com.runrace.backend.common.KstTime;
import java.time.DateTimeException;
import java.time.ZoneId;

/** users.time_zone 문자열을 ZoneId로 바꾼다. 비었거나 해석할 수 없으면 Asia/Seoul. */
public final class UserTimeZones {
  private UserTimeZones() {}

  public static ZoneId resolve(String timeZone) {
    if (timeZone == null || timeZone.isBlank()) return KstTime.ZONE;
    try {
      return ZoneId.of(timeZone);
    } catch (DateTimeException ignored) {
      return KstTime.ZONE;
    }
  }
}
