package com.runrace.backend.nudge;

import java.time.OffsetDateTime;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NudgeRepository extends JpaRepository<Nudge, Long> {
  /** 오늘(startOfDay 이후) 같은 상대에게 보낸 콕 찌르기가 있는지 — 일일 1회 제한 판정. */
  boolean existsBySenderIdAndReceiverIdAndSentAtGreaterThanEqual(
      UUID senderId, UUID receiverId, OffsetDateTime startOfDay);
}
