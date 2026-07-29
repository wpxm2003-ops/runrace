package com.runrace.backend.challenge.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.inOrder;
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
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/** 레이스 거리 반영 핵심(목표 달성=완주·승자 확정 / 되돌림=완주·승자 초기화) 회귀 잠금. */
@ExtendWith(MockitoExtension.class)
class ChallengeProgressServiceTest {

  @Mock ChallengeRepository challengeRepository;
  @Mock ChallengeMemberRepository challengeMemberRepository;
  @Mock ChallengeWorkoutRepository challengeWorkoutRepository;
  @Mock RaceFinalizationService raceFinalization;
  @Mock ChallengeService challengeService;
  @Mock org.springframework.context.ApplicationEventPublisher eventPublisher;

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
  void 목표_도달하면_완주_표시하고_최초_완주자를_승자로_저장() {
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
    assertSame(me, c.getWinner(), "최초 완주자를 즉시 승자로 확정");
    verify(challengeRepository).save(c);
    verify(challengeMemberRepository).save(mine);
    verify(raceFinalization, never()).finalizeRace(any(), anyList(), any());
  }

  @Test
  void 전원_완주시_먼저_끝난_사람을_승자로_계산해_종료_처리를_위임한다() {
    AppUser me = user("me");
    AppUser other = user("other");
    Challenge c = Challenge.builder().id(1L).goalKm(BigDecimal.valueOf(10)).build();
    ChallengeMember mine = member(me, c, 8, null);
    // 상대는 이미 완주(과거 시각) — 내가 지금 완주하면 상대가 먼저 끝난 승자여야 한다.
    ChallengeMember others = member(other, c, 10, T0.minusMinutes(5));
    when(challengeMemberRepository.countByChallengeIdAndIdNotAndFinishedAtIsNull(eq(1L), any()))
        .thenReturn(0L); // 나 말고는 전원 완주

    service.applyDistanceToMemberWithContext(mine, BigDecimal.valueOf(3), T0, List.of(mine, others));

    assertNotNull(mine.getFinishedAt());
    org.mockito.ArgumentCaptor<AppUser> winnerCaptor = org.mockito.ArgumentCaptor.forClass(AppUser.class);
    verify(raceFinalization).finalizeRace(eq(c), eq(List.of(mine, others)), winnerCaptor.capture());
    assertSame(other, winnerCaptor.getValue(), "먼저 완주한 상대가 승자");
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

  /**
   * 기간 만료로 끝난 레이스는 남의 기록이 삭제돼도 종료 상태와 우승자를 유지해야 한다.
   * 예전에는 경로 구분 없이 resetEnded + clearFinalRanks를 실행해,
   * A의 기록 삭제만으로 이미 끝난 레이스가 되살아나고 B의 우승과 전원의 확정 순위가 지워졌다.
   */
  @Test
  void 기간만료로_끝난_레이스는_남의_기록_삭제에도_종료와_우승자를_유지한다() {
    AppUser me = user("me");
    AppUser other = user("other");
    Challenge c = Challenge.builder()
        .id(1L)
        .goalKm(BigDecimal.valueOf(10))
        .endAt(OffsetDateTime.now().minusDays(1)) // 이미 기간 만료
        .build();
    c.declareWinner(other); // 우승자는 B
    c.end();
    ChallengeMember mine = member(me, c, 12, T0); // A는 완주 상태
    ChallengeMember others = member(other, c, 20, T0);
    ChallengeWorkout link = ChallengeWorkout.builder()
        .id(1L)
        .challenge(c)
        .user(me)
        .appliedDistanceM(5000) // 5km 차감 → 12-5=7 < 10 → A의 완주 해제
        .approvalStatus(ApprovalStatus.APPROVED)
        .build();

    when(challengeWorkoutRepository.findAllByWorkoutSessionId(100L)).thenReturn(List.of(link));
    service.reverseWorkoutDistance(100L);

    assertEquals(BigDecimal.valueOf(12.0), mine.getTotalKm(), "종료 레이스 거리는 고정");
    assertNotNull(mine.getFinishedAt(), "종료 레이스 완주 상태는 고정");
    assertTrue(c.isEnded(), "종료 상태 유지");
    assertSame(other, c.getWinner(), "기존 우승자 유지");
    verify(challengeMemberRepository, never()).save(any());
    verify(raceFinalization, never()).clearFinalRanks(anyLong());
    verify(raceFinalization, never()).assignFinalRanks(anyList());
    verify(challengeWorkoutRepository).deleteAll(List.of(link));
  }

  /**
   * 동시 완주 시 승자 확정이 경합하지 않도록, 사용자가 걸쳐 있는 레이스 행을 정렬된 순서로
   * 한 번에 잠근다. 잠그지 않으면(또는 정렬하지 않으면) 이 테스트가 회귀를 잡는다.
   */
  @Test
  void 활성_레이스가_여러_개면_정렬된_id로_한번에_잠근다() {
    AppUser me = user("me");
    Challenge c1 = Challenge.builder().id(5L).goalKm(BigDecimal.valueOf(10)).build();
    Challenge c2 = Challenge.builder().id(2L).goalKm(BigDecimal.valueOf(10)).build();
    ChallengeMember m1 = member(me, c1, 0, null);
    ChallengeMember m2 = member(me, c2, 0, null);
    when(challengeMemberRepository.findAllActiveChallengeIdsForUser(me.getId(), T0))
        .thenReturn(List.of(5L, 2L));
    when(challengeMemberRepository.findAllActiveForUser(me.getId(), T0))
        .thenReturn(List.of(m1, m2));
    when(challengeMemberRepository.findAllByChallengeIdIn(List.of(2L, 5L))).thenReturn(List.of());
    when(challengeService.deleteIfSolo(any(), eq(T0))).thenReturn(false);

    service.forEachActiveChallengeMember(me.getId(), T0, (member, all) -> {});

    InOrder order = inOrder(challengeMemberRepository, challengeRepository);
    order.verify(challengeMemberRepository).findAllActiveChallengeIdsForUser(me.getId(), T0);
    order.verify(challengeRepository).findAllByIdsForUpdate(List.of(2L, 5L));
    order.verify(challengeMemberRepository).findAllActiveForUser(me.getId(), T0);
    order.verify(challengeMemberRepository).findAllByChallengeIdIn(List.of(2L, 5L));
  }

  @Test
  void 실내런_단건_반영도_레이스_잠금_후_멤버를_조회한다() {
    AppUser me = user("me");
    Challenge challenge = Challenge.builder().id(1L).goalKm(BigDecimal.TEN).build();
    ChallengeMember mine = member(me, challenge, 2, null);
    when(challengeRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(challenge));
    when(challengeMemberRepository.findByChallengeIdAndUserId(1L, me.getId()))
        .thenReturn(Optional.of(mine));
    when(challengeMemberRepository.findAllForChallenge(1L)).thenReturn(List.of(mine));

    service.applyDistanceToMember(1L, me.getId(), BigDecimal.ONE, T0);

    InOrder order = inOrder(challengeRepository, challengeMemberRepository);
    order.verify(challengeRepository).findByIdForUpdate(1L);
    order.verify(challengeMemberRepository).findByChallengeIdAndUserId(1L, me.getId());
    order.verify(challengeMemberRepository).findAllForChallenge(1L);
    assertEquals(BigDecimal.valueOf(3.0), mine.getTotalKm());
  }

  @Test
  void 종료시각이_지나면_확정_전이라도_결과가_고정된다() {
    AppUser me = user("me");
    Challenge challenge = Challenge.builder()
        .id(2L)
        .goalKm(BigDecimal.valueOf(10))
        .endAt(OffsetDateTime.now().minusMinutes(1))
        .build();
    ChallengeMember mine = member(me, challenge, 12, T0);
    ChallengeWorkout link = ChallengeWorkout.builder()
        .id(2L)
        .challenge(challenge)
        .user(me)
        .appliedDistanceM(5000)
        .approvalStatus(ApprovalStatus.APPROVED)
        .build();
    when(challengeWorkoutRepository.findAllByWorkoutSessionId(200L)).thenReturn(List.of(link));

    service.reverseWorkoutDistance(200L);

    assertEquals(BigDecimal.valueOf(12.0), mine.getTotalKm());
    assertNotNull(mine.getFinishedAt());
    verify(challengeMemberRepository, never()).save(any());
    verify(raceFinalization, never()).assignFinalRanks(anyList());
    verify(raceFinalization, never()).clearFinalRanks(anyLong());
    verify(challengeWorkoutRepository).deleteAll(List.of(link));
  }
}
