package com.runrace.backend.friend;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FriendshipRepository extends JpaRepository<Friendship, UUID> {
  /** 친구 목록 조회 — friend(AppUser)를 함께 가져와 N+1을 방지한다. */
  @Query("""
      select f from Friendship f
      join fetch f.friend
      where f.user.id = :userId
      """)
  List<Friendship> findAllByUserId(@Param("userId") UUID userId);

  boolean existsByUserIdAndFriendId(UUID userId, UUID friendUserId);
}

