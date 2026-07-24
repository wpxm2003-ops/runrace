package com.runrace.backend.push.service;

import com.runrace.backend.push.domain.DeviceToken;
import com.runrace.backend.push.repository.DeviceTokenRepository;
import com.runrace.backend.user.repository.AppUserRepository;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

/**
 * 디바이스(FCM) 토큰 등록/갱신. DB 유니크 키는 (user_id, platform)으로
 * 플랫폼당 1개의 토큰만 유지한다. 토큰이 갱신되면 기존 행을 덮어쓴다.
 */
@Service
@RequiredArgsConstructor
public class DeviceTokenService {
  private final AppUserRepository appUserRepository;
  private final DeviceTokenRepository deviceTokenRepository;

  public void upsert(UUID userId, String platform, String fcmToken) {
    OffsetDateTime now = OffsetDateTime.now();

    // 이 유저의 '첫' 디바이스 토큰인지(등록 전 기준). 첫 토큰일 때만 push_enabled를 켠다.
    // 재등록(앱 콜드스타트마다 발생)·추가 플랫폼 등록에서는 켜지 않아, 사용자가 명시적으로 끈
    // 알림 설정(opt-out)을 덮어쓰지 않는다 — '수신 불가 → 수신 가능' 전환 지점만 잡는다.
    boolean firstToken = !deviceTokenRepository.existsByUserId(userId);

    var existing = deviceTokenRepository.findByUserIdAndPlatform(userId, platform);
    if (existing.isPresent()) {
      // 기존 행 — 토큰이 같으면 시각만 갱신(멱등), 달라졌으면 새 토큰으로 덮어쓴다.
      // 이 플랫폼 토큰이 이미 있으므로 firstToken일 수 없다(push_enabled 미변경).
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
      // 동시 등록 레이스 — 다른 요청이 먼저 삽입한 경우. 재조회 후 업데이트.
      deviceTokenRepository.findByUserIdAndPlatform(userId, platform)
          .ifPresent(t -> {
            t.updateToken(fcmToken, now);
            deviceTokenRepository.save(t);
          });
    }

    // 첫 토큰이 방금 등록됐으면 푸시 수신을 켠다. 자체 트랜잭션(enablePush)이라 위 레이스 캐치와 무관.
    if (firstToken) {
      appUserRepository.enablePush(userId);
    }
  }
}
