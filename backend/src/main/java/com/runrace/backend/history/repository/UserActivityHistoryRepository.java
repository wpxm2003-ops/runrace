package com.runrace.backend.history.repository;

import com.runrace.backend.history.domain.UserActivityHistory;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserActivityHistoryRepository
    extends JpaRepository<UserActivityHistory, Long> {}
