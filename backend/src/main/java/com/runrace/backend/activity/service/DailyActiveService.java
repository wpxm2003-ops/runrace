package com.runrace.backend.activity.service;

import com.runrace.backend.activity.domain.ClientPlatform;
import com.runrace.backend.activity.domain.UserTimeZones;
import com.runrace.backend.activity.repository.UserDailyActiveRepository;
import com.runrace.backend.common.ApiException;
import com.runrace.backend.user.domain.AppUser;
import com.runrace.backend.user.repository.AppUserRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * 일일 활성 핑 기록. 클라이언트는 앱 부팅·포그라운드 복귀 때 하루 한 번만 부르지만(마지막 핑
 * 날짜를 기기에 기억), 재설치·다중 탭·연타로 여러 번 와도 서버가 같은 날 한 행으로 합친다.
 */
@Service
@RequiredArgsConstructor
public class DailyActiveService {
  private final AppUserRepository appUserRepository;
  private final UserDailyActiveRepository userDailyActiveRepository;

  public PingResult recordPing(UUID userId, String platformCode) {
    return recordPing(userId, platformCode, Instant.now());
  }

  /** 테스트에서 시각을 고정해 부른다. */
  PingResult recordPing(UUID userId, String platformCode, Instant now) {
    ClientPlatform platform = ClientPlatform.fromCode(platformCode)
        .orElseThrow(() -> ApiException.badRequest("invalid_platform"));
    AppUser user = appUserRepository.getRequired(userId);
    LocalDate localDate = localDateOf(user.getTimeZone(), now);
    boolean recorded = userDailyActiveRepository.insertIfAbsent(
        userId, localDate, platform, OffsetDateTime.ofInstant(now, ZoneOffset.UTC));
    return new PingResult(localDate, recorded);
  }

  /** 그 순간의 사용자 현지 날짜. 시간대가 비었거나 잘못됐으면 Asia/Seoul. */
  static LocalDate localDateOf(String timeZone, Instant now) {
    ZoneId zone = UserTimeZones.resolve(timeZone);
    return now.atZone(zone).toLocalDate();
  }

  public record PingResult(LocalDate localDate, boolean recorded) {}
}
