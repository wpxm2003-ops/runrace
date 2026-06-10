package com.runrace.backend.challenge;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ChallengeWorkoutRepository extends JpaRepository<ChallengeWorkout, Long> {
  boolean existsByChallengeIdAndWorkoutSessionId(Long challengeId, Long workoutSessionId);

  Optional<ChallengeWorkout> findByChallengeIdAndWorkoutSessionId(Long challengeId, Long workoutSessionId);

  @Query("""
      select cw from ChallengeWorkout cw
      join fetch cw.challenge c
      join fetch cw.user u
      where cw.workoutSession.id = :workoutSessionId
      """)
  List<ChallengeWorkout> findAllByWorkoutSessionId(@Param("workoutSessionId") Long workoutSessionId);

  /** 레이스에 반영된 운동만 — 실내러닝 PENDING/REJECTED 제외 */
  @Query(
      """
      select cw from ChallengeWorkout cw
      join fetch cw.workoutSession ws
      join fetch ws.user u
      where cw.challenge.id = :challengeId
        and cw.approvalStatus = :status
      order by ws.startedAt desc
      """)
  List<ChallengeWorkout> findAllByChallengeIdAndApprovalStatusOrderByStartedDesc(
      @Param("challengeId") Long challengeId,
      @Param("status") ApprovalStatus status);

  @Query("""
      select cw from ChallengeWorkout cw
      join fetch cw.workoutSession ws
      join fetch cw.user u
      where cw.challenge.id = :challengeId
        and cw.approvalStatus = :status
      order by ws.startedAt desc
      """)
  List<ChallengeWorkout> findAllByChallengeIdAndApprovalStatus(
      @Param("challengeId") Long challengeId,
      @Param("status") ApprovalStatus status);
}
