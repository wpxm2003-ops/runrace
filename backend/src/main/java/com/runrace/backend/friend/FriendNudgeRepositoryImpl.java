package com.runrace.backend.friend;

import com.querydsl.jpa.impl.JPAQueryFactory;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.RequiredArgsConstructor;

@RequiredArgsConstructor
public class FriendNudgeRepositoryImpl implements FriendNudgeRepositoryCustom {

  private static final QFriendNudge nudge = QFriendNudge.friendNudge;

  private final JPAQueryFactory query;

  @Override
  public boolean existsTodayNudge(UUID senderId, UUID receiverId, OffsetDateTime startOfDay) {
    return query.selectOne()
        .from(nudge)
        .where(
            nudge.sender.id.eq(senderId),
            nudge.receiver.id.eq(receiverId),
            nudge.sentAt.goe(startOfDay))
        .fetchFirst() != null;
  }
}
