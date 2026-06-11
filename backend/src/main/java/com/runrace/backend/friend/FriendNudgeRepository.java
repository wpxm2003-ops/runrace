package com.runrace.backend.friend;

import org.springframework.data.jpa.repository.JpaRepository;

public interface FriendNudgeRepository
    extends JpaRepository<FriendNudge, Long>, FriendNudgeRepositoryCustom {
}
