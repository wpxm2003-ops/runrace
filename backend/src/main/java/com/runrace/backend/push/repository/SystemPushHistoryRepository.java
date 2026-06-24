package com.runrace.backend.push.repository;

import com.runrace.backend.push.domain.SystemPushHistory;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SystemPushHistoryRepository extends JpaRepository<SystemPushHistory, Long> {

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
