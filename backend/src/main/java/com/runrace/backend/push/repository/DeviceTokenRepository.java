package com.runrace.backend.push.repository;

import com.runrace.backend.push.domain.DeviceToken;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DeviceTokenRepository extends JpaRepository<DeviceToken, UUID> {
  List<DeviceToken> findAllByUserId(UUID userId);

  /** 푸시 수신 가능한 단말(디바이스 토큰)이 등록돼 있는지 — 알림 토글 가능 여부 판정용. */
  boolean existsByUserId(UUID userId);

  /** DB 유니크 키(user_id, platform)와 동일한 기준으로 조회 — 멱등 upsert용. */
  Optional<DeviceToken> findByUserIdAndPlatform(UUID userId, String platform);

  /** 탈퇴 시 모든 디바이스 토큰 삭제(푸시 중단). */
  @Modifying
  @Query("delete from DeviceToken d where d.user.id = :id")
  void deleteAllByUser(@Param("id") UUID id);
}

