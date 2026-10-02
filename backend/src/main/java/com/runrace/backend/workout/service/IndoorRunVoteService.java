package com.runrace.backend.workout.service;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.challenge.domain.ApprovalStatus;
import com.runrace.backend.challenge.domain.ChallengeWorkout;
import com.runrace.backend.challenge.domain.IndoorRunApproval;
import com.runrace.backend.challenge.repository.ChallengeWorkoutRepository;
import com.runrace.backend.challenge.repository.IndoorRunApprovalRepository;
import com.runrace.backend.challenge.service.IndoorApprovalService;
import com.runrace.backend.common.ApiException;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 실내 러닝 승인 투표와 최종 거리 반영을 전담한다. */
@Service
@RequiredArgsConstructor
public class IndoorRunVoteService {
  private final ChallengeWorkoutRepository challengeWorkoutRepository;
  private final IndoorRunApprovalRepository indoorRunApprovalRepository;
  private final IndoorApprovalService indoorApprovalService;

  @Transactional
  public void vote(AuthPrincipal principal, Long workoutId, boolean approved) {
    List<ChallengeWorkout> pending = challengeWorkoutRepository
        .findAllByWorkoutSessionIdForUpdate(workoutId)
        .stream()
        .filter(workout -> workout.getApprovalStatus() == ApprovalStatus.PENDING)
        .toList();
    if (pending.isEmpty()) throw ApiException.notFound("no_pending_approval");

    boolean voted = false;
    for (ChallengeWorkout workout : pending) {
      voted |= applyVote(workout, principal.userId(), approved);
    }
    if (!voted) throw ApiException.forbidden("not_a_voter");
  }

  private boolean applyVote(ChallengeWorkout workout, UUID voterId, boolean approved) {
    IndoorRunApproval vote = indoorRunApprovalRepository
        .findByChallengeWorkoutIdAndVoterId(workout.getId(), voterId)
        .orElse(null);
    if (vote == null) return false;
    if (vote.getApproved() != null) throw ApiException.badRequest("already_voted");

    vote.castVote(approved);
    indoorRunApprovalRepository.save(vote);
    if (!approved) {
      workout.reject();
      challengeWorkoutRepository.save(workout);
    } else if (indoorApprovalService.isFullyApproved(workout.getId())) {
      indoorApprovalService.applyApprovedIndoorRun(workout.getId());
    }
    return true;
  }
}
