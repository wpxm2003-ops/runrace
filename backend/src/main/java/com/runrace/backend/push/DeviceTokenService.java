package com.runrace.backend.push;

import com.runrace.backend.user.AppUserRepository;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 디바이스(FCM) 토큰 등록/갱신. 사용자·플랫폼당 1행을 유지한다. */
@Service
@RequiredArgsConstructor
public class DeviceTokenService {
  private final AppUserRepository appUserRepository;
  private final DeviceTokenRepository deviceTokenRepository;

  @Transactional
  public void upsert(UUID userId, String platform, String fcmToken) {
    OffsetDateTime now = OffsetDateTime.now();
    DeviceToken token = deviceTokenRepository
        .findByUserIdAndPlatform(userId, platform)
        .orElseGet(() -> DeviceToken.builder()
            .user(appUserRepository.getReferenceById(userId))
            .platform(platform)
            .fcmToken(fcmToken)
            .updatedAt(now)
            .build());

    // 기존 행이면 토큰만 갱신
    if (token.getId() != null) {
      token.updateToken(fcmToken, now);
    }
    deviceTokenRepository.save(token);
  }
}
