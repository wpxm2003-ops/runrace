package com.runrace.backend.fitness.repository;

import com.runrace.backend.fitness.domain.DailyDistance;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DailyDistanceRepository extends JpaRepository<DailyDistance, UUID> {
  Optional<DailyDistance> findByUserIdAndDateAndSource(UUID userId, LocalDate date, String source);
}

