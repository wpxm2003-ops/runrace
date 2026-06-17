package com.runrace.backend.challenge.repository;

import com.runrace.backend.challenge.domain.IndoorRunApproval;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface IndoorRunApprovalRepository
    extends JpaRepository<IndoorRunApproval, Long>, IndoorRunApprovalRepositoryCustom {

  List<IndoorRunApproval> findAllByChallengeWorkoutId(Long challengeWorkoutId);

  Optional<IndoorRunApproval> findByChallengeWorkoutIdAndVoterId(Long challengeWorkoutId, UUID voterId);
}
