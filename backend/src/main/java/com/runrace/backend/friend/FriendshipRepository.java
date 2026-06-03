package com.runrace.backend.friend;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FriendshipRepository extends JpaRepository<Friendship, UUID> {
  List<Friendship> findAllByUserId(UUID userId);
  boolean existsByUserIdAndFriendId(UUID userId, UUID friendUserId);
}

