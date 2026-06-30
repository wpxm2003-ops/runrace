package com.runrace.backend.workout.repository;

import com.runrace.backend.workout.domain.PersonalBest;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PersonalBestRepository extends JpaRepository<PersonalBest, Long> {
  Optional<PersonalBest> findByUserIdAndDistanceKey(UUID userId, String distanceKey);

  List<PersonalBest> findAllByUserId(UUID userId);
}
