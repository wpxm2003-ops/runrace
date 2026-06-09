package com.runrace.backend.challenge;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface IndoorRunApprovalRepository extends JpaRepository<IndoorRunApproval, Long> {

  List<IndoorRunApproval> findAllByChallengeWorkoutId(Long challengeWorkoutId);

  /**
   * 여러 ChallengeWorkout의 투표를 한 번에 조회한다. voter를 함께 가져와 N+1을 방지한다.
   * 승인 대기·거부 목록 조회용.
   */
  @Query("""
      select a from IndoorRunApproval a
      join fetch a.voter
      where a.challengeWorkout.id in :challengeWorkoutIds
      """)
  List<IndoorRunApproval> findAllByChallengeWorkoutIdIn(
      @Param("challengeWorkoutIds") List<Long> challengeWorkoutIds);

  Optional<IndoorRunApproval> findByChallengeWorkoutIdAndVoterId(
      Long challengeWorkoutId, UUID voterId);
}
