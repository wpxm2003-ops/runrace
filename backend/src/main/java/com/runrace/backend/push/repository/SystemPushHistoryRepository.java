package com.runrace.backend.push.repository;

import com.runrace.backend.push.domain.SystemPushHistory;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SystemPushHistoryRepository extends JpaRepository<SystemPushHistory, Long> {

  /** 특정 pushType으로 오늘 이미 발송했는지 확인 — 라이벌 알림 중복 방지용. */
  boolean existsByUserIdAndPushTypeAndSentAtAfter(UUID userId, String pushType, OffsetDateTime after);

  /** 특정 pushType으로 발송한 적이 있는지 — 신발 교체 알림(신발당 1회) 중복 방지용. */
  boolean existsByUserIdAndPushType(UUID userId, String pushType);

  @Query("""
      SELECT COUNT(h) FROM SystemPushHistory h
      WHERE h.userId = :userId
        AND h.pushType IN :types
        AND h.sentAt >= :weekStart
      """)
  long countByUserAndTypes(
      @Param("userId") UUID userId,
      @Param("types") List<String> types,
      @Param("weekStart") OffsetDateTime weekStart);
}
