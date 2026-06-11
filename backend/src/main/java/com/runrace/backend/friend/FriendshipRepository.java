package com.runrace.backend.friend;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FriendshipRepository
    extends JpaRepository<Friendship, UUID>, FriendshipRepositoryCustom {

  boolean existsByUserIdAndFriendId(UUID userId, UUID friendUserId);
}
