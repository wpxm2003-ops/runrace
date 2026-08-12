package com.runrace.backend.auth.repository;

import com.runrace.backend.auth.domain.UserLoginHistory;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserLoginHistoryRepository extends JpaRepository<UserLoginHistory, Long> {}
