package com.runrace.backend.nudge.repository;

import com.runrace.backend.nudge.domain.Nudge;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface NudgeRepository extends JpaRepository<Nudge, Long> {
  /** 오늘(startOfDay 이후) 같은 상대에게 보낸 콕 찌르기가 있는지 — 일일 1회 제한 판정. */
  boolean existsBySenderIdAndReceiverIdAndSentAtGreaterThanEqual(
      UUID senderId, UUID receiverId, OffsetDateTime startOfDay);

  /** 탈퇴 시 보낸/받은 콕 찌르기 일괄 삭제. */
  @Modifying
  @Query("delete from Nudge n where n.sender.id = :id or n.receiver.id = :id")
  void deleteAllByUser(@Param("id") UUID id);
}
