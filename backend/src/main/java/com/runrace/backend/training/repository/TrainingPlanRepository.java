package com.runrace.backend.training.repository;

import com.runrace.backend.training.domain.TrainingPlan;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TrainingPlanRepository extends JpaRepository<TrainingPlan, Long> {
  Optional<TrainingPlan> findByUserId(UUID userId);
}
