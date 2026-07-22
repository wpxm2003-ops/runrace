package com.runrace.backend.challenge.repository;

import com.runrace.backend.challenge.domain.ChallengeWorkout;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChallengeWorkoutRepository
    extends JpaRepository<ChallengeWorkout, Long>, ChallengeWorkoutRepositoryCustom {

  boolean existsByChallengeIdAndWorkoutSessionId(Long challengeId, Long workoutSessionId);
}
