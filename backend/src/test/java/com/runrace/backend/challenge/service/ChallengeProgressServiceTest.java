package com.runrace.backend.challenge.service;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.runrace.backend.challenge.domain.ApprovalStatus;
import com.runrace.backend.challenge.domain.Challenge;
import com.runrace.backend.challenge.domain.ChallengeMember;
import com.runrace.backend.challenge.domain.ChallengeWorkout;
import com.runrace.backend.challenge.repository.ChallengeMemberRepository;
import com.runrace.backend.challenge.repository.ChallengeRepository;
import com.runrace.backend.challenge.repository.ChallengeWorkoutRepository;
import com.runrace.backend.user.domain.AppUser;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/** 레이스 거리 반영 핵심(목표 달성=완주·승자 확정 / 되돌림=완주·승자 초기화) 회귀 잠금. */
@ExtendWith(MockitoExtension.class)
class ChallengeProgressServiceTest {

  @Mock ChallengeRepository challengeRepository;
  @Mock ChallengeMemberRepository challengeMemberRepository;
  @Mock ChallengeWorkoutRepository challengeWorkoutRepository;
  @Mock RaceFinalizationService raceFinalization;

  @InjectMocks ChallengeProgressService service;

  private static final OffsetDateTime T0 = OffsetDateTime.parse("2026-01-01T00:00:00Z");

  private static AppUser user(String nick) {
    return AppUser.builder().id(UUID.randomUUID()).nickname(nick).build();
  }

  private static ChallengeMember member(AppUser u, Challenge c, double km, OffsetDateTime finishedAt) {
    return ChallengeMember.builder()
        .id(UUID.randomUUID())
        .user(u)
        .challenge(c)
        .totalKm(BigDecimal.valueOf(km))
        .finishedAt(finishedAt)
        .build();
  }

  @Test
  void 목표_도달하면_완주_표시_및_승자_확정() {
    AppUser me = user("me");
    AppUser other = user("other");
    Challenge c = Challenge.builder().id(1L).goalKm(BigDecimal.valueOf(10)).build();
    ChallengeMember mine = member(me, c, 8, null);
    ChallengeMember others = member(other, c, 2, null);
    // 남은 미완주자 존재 → 전원 완주 아님(레이스 종료 아님)
    when(challengeMemberRepository.countByChallengeIdAndIdNotAndFinishedAtIsNull(eq(1L), any()))
        .thenReturn(1L);

    // 8 + 3 = 11 >= 목표 10
    service.applyDistanceToMemberWithContext(mine, BigDecimal.valueOf(3), T0, List.of(mine, others));

    assertNotNull(mine.getFinishedAt(), "목표 도달 시 완주 시각 기록");
    assertSame(me, c.getWinner(), "첫 완주자가 승자로 확정");
    verify(challengeRepository).save(c);
    verify(challengeMemberRepository).save(mine);
    verify(raceFinalization, never()).finalizeRace(any(), anyList(), any());
  }

  @Test
  void 목표_미달이면_완주_아님_승자_없음() {
    AppUser me = user("me");
    Challenge c = Challenge.builder().id(1L).goalKm(BigDecimal.valueOf(10)).build();
    ChallengeMember mine = member(me, c, 2, null);

    // 2 + 3 = 5 < 목표 10
    service.applyDistanceToMemberWithContext(mine, BigDecimal.valueOf(3), T0, List.of(mine));

    assertNull(mine.getFinishedAt());
    assertNull(c.getWinner());
    verify(challengeMemberRepository).save(mine);
    verify(challengeRepository, never()).save(any());
  }

  @Test
  void 운동_되돌림으로_목표_미달되면_완주_승자_초기화() {
    AppUser me = user("me");
    Challenge c = Challenge.builder().id(1L).goalKm(BigDecimal.valueOf(10)).build();
    c.declareWinner(me);
    c.end();
    ChallengeMember mine = member(me, c, 12, T0); // 완주 상태
    ChallengeWorkout link = ChallengeWorkout.builder()
        .id(1L)
        .challenge(c)
        .user(me)
        .appliedDistanceM(5000) // 5km 차감 → 12-5=7 < 10
        .approvalStatus(ApprovalStatus.APPROVED)
        .build();

    when(challengeWorkoutRepository.findAllByWorkoutSessionId(100L)).thenReturn(List.of(link));
    when(challengeMemberRepository.findByChallengeIdAndUserId(1L, me.getId()))
        .thenReturn(Optional.of(mine));

    service.reverseWorkoutDistance(100L);

    assertNull(mine.getFinishedAt(), "목표 미달로 완주 해제");
    assertNull(c.getWinner(), "승자 초기화");
    assertFalse(c.isEnded(), "종료 상태 해제");
    verify(raceFinalization).clearFinalRanks(1L);
    verify(challengeWorkoutRepository).deleteAll(List.of(link));
  }
}
