package com.runrace.backend.activity.domain;

import com.runrace.backend.common.KstTime;
import java.time.ZoneId;
import java.util.Optional;

/** 시간대 문자열을 ZoneId로 바꾼다. */
public final class UserTimeZones {
  private UserTimeZones() {}

  /**
   * 알려진 IANA 시간대 ID면 그 ZoneId. 비었거나 모르는 값이면 empty. 허용 목록은 내 정보의
   * 시간대 저장(AccountService.updatePreferences)과 같은 {@link ZoneId#getAvailableZoneIds()}다
   * — "+09:00" 같은 오프셋 문자열은 받지 않는다.
   */
  public static Optional<ZoneId> parse(String timeZone) {
    if (timeZone == null || !ZoneId.getAvailableZoneIds().contains(timeZone)) {
      return Optional.empty();
    }
    return Optional.of(ZoneId.of(timeZone));
  }

  /** users.time_zone용 — 비었거나 해석할 수 없으면 Asia/Seoul. */
  public static ZoneId resolve(String timeZone) {
    return parse(timeZone).orElse(KstTime.ZONE);
  }
}
