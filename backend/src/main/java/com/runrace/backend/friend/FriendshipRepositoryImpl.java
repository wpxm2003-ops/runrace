package com.runrace.backend.friend;

import com.querydsl.jpa.impl.JPAQueryFactory;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;

@RequiredArgsConstructor
public class FriendshipRepositoryImpl implements FriendshipRepositoryCustom {

  private static final QFriendship friendship = QFriendship.friendship;

  private final JPAQueryFactory query;

  @Override
  public List<Friendship> findAllByUserId(UUID userId) {
    return query.selectFrom(friendship)
        .join(friendship.friend).fetchJoin()
        .where(friendship.user.id.eq(userId))
        .fetch();
  }
}
