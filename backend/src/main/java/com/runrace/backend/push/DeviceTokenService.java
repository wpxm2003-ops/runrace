package com.runrace.backend.push;

import com.runrace.backend.user.AppUserRepository;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

/**
 * 디바이스(FCM) 토큰 등록/갱신. DB 유니크 키는 (user_id, platform, fcm_token)이라
 * 같은 user+platform이라도 기기별 토큰을 여러 개 허용한다(멀티 디바이스).
 */
@Service
@RequiredArgsConstructor
public class DeviceTokenService {
  private final AppUserRepository appUserRepository;
  private final DeviceTokenRepository deviceTokenRepository;

  public void upsert(UUID userId, String platform, String fcmToken) {
    OffsetDateTime now = OffsetDateTime.now();

    // 같은 토큰이 다시 들어오면 시각만 갱신(멱등). 앱 실행/복귀마다 재등록돼도 안전.
    var existing = deviceTokenRepository.findByUserIdAndPlatformAndFcmToken(userId, platform, fcmToken);
    if (existing.isPresent()) {
      DeviceToken t = existing.get();
      t.updateToken(fcmToken, now);
      deviceTokenRepository.save(t);
      return;
    }

    try {
      deviceTokenRepository.saveAndFlush(
          DeviceToken.builder()
              .user(appUserRepository.getReferenceById(userId))
              .platform(platform)
              .fcmToken(fcmToken)
              .updatedAt(now)
              .build());
    } catch (DataIntegrityViolationException e) {
      // 동시 등록 레이스(다른 요청이 같은 토큰을 먼저 삽입) — 이미 등록된 셈이라 무시.
    }
  }
}
