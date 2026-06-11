package com.runrace.backend.challenge;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChallengeWorkoutRepository
    extends JpaRepository<ChallengeWorkout, Long>, ChallengeWorkoutRepositoryCustom {

  boolean existsByChallengeIdAndWorkoutSessionId(Long challengeId, Long workoutSessionId);

  Optional<ChallengeWorkout> findByChallengeIdAndWorkoutSessionId(Long challengeId, Long workoutSessionId);
}
