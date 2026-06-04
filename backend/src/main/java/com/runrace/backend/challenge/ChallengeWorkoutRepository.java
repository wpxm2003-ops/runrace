package com.runrace.backend.challenge;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ChallengeWorkoutRepository extends JpaRepository<ChallengeWorkout, Long> {
  boolean existsByChallengeIdAndWorkoutSessionId(Long challengeId, Long workoutSessionId);

  Optional<ChallengeWorkout> findByChallengeIdAndWorkoutSessionId(Long challengeId, Long workoutSessionId);

  @Query(
      """
      select cw from ChallengeWorkout cw
      join fetch cw.workoutSession ws
      join fetch ws.user u
      where cw.challenge.id = :challengeId
      order by ws.startedAt desc
      """)
  List<ChallengeWorkout> findAllForChallengeOrderByStartedDesc(@Param("challengeId") Long challengeId);
}
