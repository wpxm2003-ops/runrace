package com.runrace.backend.challenge.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.runrace.backend.challenge.domain.ApprovalStatus;
import com.runrace.backend.challenge.domain.Challenge;
import com.runrace.backend.challenge.domain.ChallengeMember;
import com.runrace.backend.challenge.domain.ChallengeWorkout;
import com.runrace.backend.challenge.domain.IndoorRunApproval;
import com.runrace.backend.challenge.repository.ChallengeMemberRepository;
import com.runrace.backend.challenge.repository.ChallengeWorkoutRepository;
import com.runrace.backend.challenge.repository.IndoorRunApprovalRepository;
import com.runrace.backend.event.WorkoutEvents;
import com.runrace.backend.user.domain.AppUser;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

/** 실내러닝 승인 핵심 규칙(전원 승인 판정·거리 1회 반영 멱등성) 회귀 잠금. */
@ExtendWith(MockitoExtension.class)
class IndoorApprovalServiceTest {

  @Mock ChallengeMemberRepository challengeMemberRepository;
  @Mock ChallengeWorkoutRepository challengeWorkoutRepository;
  @Mock IndoorRunApprovalRepository indoorRunApprovalRepository;
  @Mock ChallengeProgressService challengeProgressService;
  @Mock ApplicationEventPublisher eventPublisher;

  @InjectMocks IndoorApprovalService service;

  private static AppUser user(String nick) {
    return AppUser.builder().id(UUID.randomUUID()).nickname(nick).build();
  }

  private static IndoorRunApproval approval(Boolean approved) {
    return IndoorRunApproval.builder().approved(approved).build();
  }

  private static ChallengeWorkout cw(long id, ApprovalStatus status, Challenge c, AppUser u) {
    return ChallengeWorkout.builder()
        .id(id)
        .challenge(c)
        .user(u)
        .appliedDistanceM(5000)
        .approvalStatus(status)
        .build();
  }

  @Test
  void 전원_승인이면_isFullyApproved_true() {
    when(indoorRunApprovalRepository.findAllByChallengeWorkoutId(1L))
        .thenReturn(List.of(approval(true), approval(true)));
    assertTrue(service.isFullyApproved(1L));
  }

  @Test
  void 하나라도_미투표_또는_거부면_false() {
    when(indoorRunApprovalRepository.findAllByChallengeWorkoutId(1L))
        .thenReturn(List.of(approval(true), approval(null)));
    assertFalse(service.isFullyApproved(1L));

    when(indoorRunApprovalRepository.findAllByChallengeWorkoutId(2L))
        .thenReturn(List.of(approval(false)));
    assertFalse(service.isFullyApproved(2L));
  }

  @Test
  void 승인_적용시_거리_반영_1회_및_이벤트_발행() {
    AppUser u = user("runner");
    Challenge c = Challenge.builder().id(10L).goalKm(BigDecimal.valueOf(10)).build();
    ChallengeWorkout pending = cw(1L, ApprovalStatus.PENDING, c, u);
    ChallengeMember member = ChallengeMember.builder().user(u).totalKm(BigDecimal.ZERO).build();

    when(challengeWorkoutRepository.findById(1L)).thenReturn(Optional.of(pending));
    when(challengeMemberRepository.findByChallengeIdAndUserId(10L, u.getId()))
        .thenReturn(Optional.of(member));

    service.applyApprovedIndoorRun(1L);

    assertEquals(ApprovalStatus.APPROVED, pending.getApprovalStatus());
    // 5000m → 5km 거리 반영이 정확히 1번
    verify(challengeProgressService).applyDistanceToMember(eq(member), any(BigDecimal.class), any());
    verify(eventPublisher).publishEvent(any(WorkoutEvents.IndoorRunApprovedEvent.class));
  }

  @Test
  void 이미_APPROVED면_멱등_재반영_없음() {
    Challenge c = Challenge.builder().id(10L).goalKm(BigDecimal.valueOf(10)).build();
    ChallengeWorkout already = cw(1L, ApprovalStatus.APPROVED, c, user("runner"));
    when(challengeWorkoutRepository.findById(1L)).thenReturn(Optional.of(already));

    service.applyApprovedIndoorRun(1L);

    // 거리 재반영·멤버 조회·이벤트 전부 없어야 함(이중 반영 방지)
    verifyNoInteractions(challengeProgressService);
    verify(challengeMemberRepository, never()).findByChallengeIdAndUserId(any(), any());
    verify(eventPublisher, never()).publishEvent(any());
  }
}
