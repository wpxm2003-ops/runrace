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
    DeviceToken token =
        deviceTokenRepository
            .findByUserIdAndPlatform(userId, platform)
            .orElseGet(
                () -> {
                  DeviceToken created = new DeviceToken();
                  created.setUser(appUserRepository.getReferenceById(userId));
                  created.setPlatform(platform);
                  return created;
                });
    token.setFcmToken(fcmToken);
    token.setUpdatedAt(OffsetDateTime.now());
    deviceTokenRepository.save(token);
  }
}
