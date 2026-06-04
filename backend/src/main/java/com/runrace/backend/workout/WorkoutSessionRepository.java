package com.runrace.backend.workout;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface WorkoutSessionRepository extends JpaRepository<WorkoutSession, Long> {
  Optional<WorkoutSession> findByIdAndUserId(Long id, UUID userId);

  List<WorkoutSession> findAllByUserIdOrderByCreatedAtDesc(UUID userId);

  List<WorkoutSession> findAllByUserIdAndStartedAtGreaterThanEqualAndStartedAtLessThanOrderByStartedAtDesc(
      UUID userId, OffsetDateTime from, OffsetDateTime to);
}
