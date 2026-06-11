package com.runrace.backend.friend;

import java.time.OffsetDateTime;
import java.util.UUID;

/** QueryDSL 기반 커스텀 쿼리. */
public interface FriendNudgeRepositoryCustom {

  /** 오늘(startOfDay 이후) 같은 상대에게 보낸 콕찌르기가 있는지. */
  boolean existsTodayNudge(UUID senderId, UUID receiverId, OffsetDateTime startOfDay);
}
