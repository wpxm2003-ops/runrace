package com.runrace.backend.push;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DeviceTokenRepository extends JpaRepository<DeviceToken, UUID> {
  List<DeviceToken> findAllByUserId(UUID userId);

  Optional<DeviceToken> findByUserIdAndPlatform(UUID userId, String platform);
}

