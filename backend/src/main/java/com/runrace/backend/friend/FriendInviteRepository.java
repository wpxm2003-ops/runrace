package com.runrace.backend.friend;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FriendInviteRepository extends JpaRepository<FriendInvite, UUID> {
  Optional<FriendInvite> findByInviteCode(String inviteCode);
}

