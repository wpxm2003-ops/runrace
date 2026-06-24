package com.runrace.backend.challenge.repository;

import com.runrace.backend.challenge.domain.IndoorRunApproval;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface IndoorRunApprovalRepository
    extends JpaRepository<IndoorRunApproval, Long>, IndoorRunApprovalRepositoryCustom {

  List<IndoorRunApproval> findAllByChallengeWorkoutId(Long challengeWorkoutId);

  Optional<IndoorRunApproval> findByChallengeWorkoutIdAndVoterId(Long challengeWorkoutId, UUID voterId);

  /** 탈퇴 시 이 사용자가 한 실내런 승인/거부 투표 일괄 삭제. */
  @Modifying
  @Query("delete from IndoorRunApproval a where a.voter.id = :id")
  void deleteAllByVoter(@Param("id") UUID id);
}
