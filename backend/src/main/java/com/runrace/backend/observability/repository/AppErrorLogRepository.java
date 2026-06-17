package com.runrace.backend.observability.repository;

import com.runrace.backend.observability.domain.AppErrorLog;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AppErrorLogRepository extends JpaRepository<AppErrorLog, UUID> {}
