package com.runrace.backend.friend;

import java.util.List;
import java.util.UUID;

/** QueryDSL 기반 커스텀 쿼리. */
public interface FriendshipRepositoryCustom {

  /** 친구 목록 — friend(AppUser)를 함께 가져와 N+1을 방지한다. */
  List<Friendship> findAllByUserId(UUID userId);
}
