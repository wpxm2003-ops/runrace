package com.runrace.backend.friend;

import java.time.OffsetDateTime;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FriendNudgeRepository extends JpaRepository<FriendNudge, Long> {

  @Query("""
      select count(n) > 0 from FriendNudge n
      where n.sender.id = :senderId
        and n.receiver.id = :receiverId
        and n.sentAt >= :startOfDay
      """)
  boolean existsTodayNudge(
      @Param("senderId") UUID senderId,
      @Param("receiverId") UUID receiverId,
      @Param("startOfDay") OffsetDateTime startOfDay);
}
