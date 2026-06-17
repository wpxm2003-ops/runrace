package com.runrace.backend.push.repository;

import com.runrace.backend.push.domain.DeviceToken;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DeviceTokenRepository extends JpaRepository<DeviceToken, UUID> {
  List<DeviceToken> findAllByUserId(UUID userId);

  /** DB 유니크 키(user_id, platform, fcm_token)와 동일한 기준으로 조회 — 멱등 upsert용. */
  Optional<DeviceToken> findByUserIdAndPlatformAndFcmToken(
      UUID userId, String platform, String fcmToken);
}

