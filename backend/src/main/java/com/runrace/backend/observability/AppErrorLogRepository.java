package com.runrace.backend.observability;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AppErrorLogRepository extends JpaRepository<AppErrorLog, UUID> {}
