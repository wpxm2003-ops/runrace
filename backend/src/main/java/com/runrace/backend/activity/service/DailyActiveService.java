package com.runrace.backend.activity.service;

import com.runrace.backend.activity.domain.ClientPlatform;
import com.runrace.backend.activity.domain.UserTimeZones;
import com.runrace.backend.activity.repository.UserDailyActiveRepository;
import com.runrace.backend.common.ApiException;
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

  public PingResult recordPing(UUID userId, String platformCode, String deviceTimeZone) {
    return recordPing(userId, platformCode, deviceTimeZone, Instant.now());
  }

  /** 테스트에서 시각을 고정해 부른다. */
  PingResult recordPing(UUID userId, String platformCode, String deviceTimeZone, Instant now) {
    ClientPlatform platform = ClientPlatform.fromCode(platformCode)
        .orElseThrow(() -> ApiException.badRequest("invalid_platform"));
    LocalDate localDate = now.atZone(zoneFor(userId, deviceTimeZone)).toLocalDate();
    boolean recorded = userDailyActiveRepository.insertIfAbsent(
        userId, localDate, platform, OffsetDateTime.ofInstant(now, ZoneOffset.UTC));
    return new PingResult(localDate, recorded);
  }

  /**
   * 핑에 실린 기기 시간대가 유효하면 그것, 아니면 users.time_zone(무효하면 Asia/Seoul).
   *
   * <p>기기 값을 먼저 보는 이유: 가입 직후 users.time_zone은 기본값 Asia/Seoul이고 기기 시간대로
   * 바뀌는 건 LanguageSync가 /me를 받은 뒤라, 첫 핑이 거의 항상 그보다 먼저 온다. 저장값만 쓰면
   * 해외 신규 가입자의 가입 당일 방문이 KST 날짜(대개 다음 날)로 박혀 D1 재방문으로 잘못 잡혔다.
   * 그 뒤 users.time_zone도 같은 기기 값으로 맞춰지므로 코호트 가입일 계산과 기준이 같다.
   */
  private ZoneId zoneFor(UUID userId, String deviceTimeZone) {
    return UserTimeZones.parse(deviceTimeZone)
        .orElseGet(() -> UserTimeZones.resolve(
            appUserRepository.getRequired(userId).getTimeZone()));
  }

  public record PingResult(LocalDate localDate, boolean recorded) {}
}
