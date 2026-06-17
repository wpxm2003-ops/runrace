package com.runrace.backend.workout.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.challenge.domain.ApprovalStatus;
import com.runrace.backend.challenge.domain.ChallengeWorkout;
import com.runrace.backend.challenge.domain.IndoorRunApproval;
import com.runrace.backend.challenge.repository.ChallengeWorkoutRepository;
import com.runrace.backend.challenge.repository.IndoorRunApprovalRepository;
import com.runrace.backend.challenge.service.ChallengeProgressService;
import com.runrace.backend.challenge.service.IndoorApprovalService;
import com.runrace.backend.common.ApiException;
import com.runrace.backend.upload.ImageUploadService;
import com.runrace.backend.user.repository.AppUserRepository;
import com.runrace.backend.workout.repository.WorkoutSessionRepository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

/** 실내러닝 투표 플로우(중복투표 차단·거부 미반영·전원승인 시 1회 반영) 회귀 잠금. */
@ExtendWith(MockitoExtension.class)
class WorkoutServiceVoteTest {

  @Mock WorkoutSessionRepository workoutSessionRepository;
  @Mock AppUserRepository appUserRepository;
  @Mock ChallengeProgressService challengeProgressService;
  @Mock IndoorApprovalService indoorApprovalService;
  @Mock ChallengeWorkoutRepository challengeWorkoutRepository;
  @Mock IndoorRunApprovalRepository indoorRunApprovalRepository;
  @Mock ImageUploadService imageUploadService;
  @Mock ApplicationEventPublisher eventPublisher;
  @Mock ObjectMapper objectMapper;

  @InjectMocks WorkoutService service;

  private static final long WORKOUT_ID = 100L;
  private final AuthPrincipal principal = new AuthPrincipal(UUID.randomUUID(), "fuid");

  private ChallengeWorkout pendingCw() {
    return ChallengeWorkout.builder().id(1L).approvalStatus(ApprovalStatus.PENDING).build();
  }

  private IndoorRunApproval myVote(Boolean approved) {
    return IndoorRunApproval.builder().approved(approved).build();
  }

  @Test
  void 대기중인_승인이_없으면_예외() {
    when(challengeWorkoutRepository.findAllByWorkoutSessionId(WORKOUT_ID)).thenReturn(List.of());
    assertThrows(ApiException.class, () -> service.voteIndoorRun(principal, WORKOUT_ID, true));
  }

  @Test
  void 투표권이_없으면_예외() {
    when(challengeWorkoutRepository.findAllByWorkoutSessionId(WORKOUT_ID))
        .thenReturn(List.of(pendingCw()));
    when(indoorRunApprovalRepository.findByChallengeWorkoutIdAndVoterId(1L, principal.userId()))
        .thenReturn(Optional.empty());
    assertThrows(ApiException.class, () -> service.voteIndoorRun(principal, WORKOUT_ID, true));
  }

  @Test
  void 이미_투표했으면_예외() {
    when(challengeWorkoutRepository.findAllByWorkoutSessionId(WORKOUT_ID))
        .thenReturn(List.of(pendingCw()));
    when(indoorRunApprovalRepository.findByChallengeWorkoutIdAndVoterId(1L, principal.userId()))
        .thenReturn(Optional.of(myVote(true))); // approved != null
    assertThrows(ApiException.class, () -> service.voteIndoorRun(principal, WORKOUT_ID, true));
  }

  @Test
  void 거부하면_REJECTED_전이_거리반영_없음() {
    ChallengeWorkout cw = pendingCw();
    IndoorRunApproval vote = myVote(null);
    when(challengeWorkoutRepository.findAllByWorkoutSessionId(WORKOUT_ID)).thenReturn(List.of(cw));
    when(indoorRunApprovalRepository.findByChallengeWorkoutIdAndVoterId(1L, principal.userId()))
        .thenReturn(Optional.of(vote));

    service.voteIndoorRun(principal, WORKOUT_ID, false);

    assertEquals(Boolean.FALSE, vote.getApproved());
    assertEquals(ApprovalStatus.REJECTED, cw.getApprovalStatus());
    verify(indoorRunApprovalRepository).save(vote);
    verify(challengeWorkoutRepository).save(cw);
    verify(indoorApprovalService, never()).applyApprovedIndoorRun(anyLong());
  }

  @Test
  void 승인했지만_전원승인_아니면_반영_없음() {
    ChallengeWorkout cw = pendingCw();
    when(challengeWorkoutRepository.findAllByWorkoutSessionId(WORKOUT_ID)).thenReturn(List.of(cw));
    when(indoorRunApprovalRepository.findByChallengeWorkoutIdAndVoterId(1L, principal.userId()))
        .thenReturn(Optional.of(myVote(null)));
    when(indoorApprovalService.isFullyApproved(1L)).thenReturn(false);

    service.voteIndoorRun(principal, WORKOUT_ID, true);

    verify(indoorApprovalService, never()).applyApprovedIndoorRun(anyLong());
  }

  @Test
  void 전원승인_충족시_거리반영_위임() {
    ChallengeWorkout cw = pendingCw();
    when(challengeWorkoutRepository.findAllByWorkoutSessionId(WORKOUT_ID)).thenReturn(List.of(cw));
    when(indoorRunApprovalRepository.findByChallengeWorkoutIdAndVoterId(1L, principal.userId()))
        .thenReturn(Optional.of(myVote(null)));
    when(indoorApprovalService.isFullyApproved(1L)).thenReturn(true);

    service.voteIndoorRun(principal, WORKOUT_ID, true);

    verify(indoorApprovalService).applyApprovedIndoorRun(1L);
  }
}
