package com.runrace.backend.challenge.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.runrace.backend.challenge.domain.Challenge;
import com.runrace.backend.challenge.domain.ChallengeMember;
import com.runrace.backend.challenge.domain.ChallengePrize;
import com.runrace.backend.challenge.domain.PrizeAwardType;
import com.runrace.backend.challenge.dto.PrizeResultResponse;
import com.runrace.backend.challenge.repository.ChallengeMemberRepository;
import com.runrace.backend.challenge.repository.ChallengePrizeRepository;
import com.runrace.backend.challenge.repository.ChallengeRepository;
import com.runrace.backend.common.ApiException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

/**
 * 경품 당첨 판정 테스트.
 *
 * <p>돈이 걸린 판정인데 테스트가 없었다. 여기서 지키려는 것은 <b>남의 경품을 내 것으로
 * 보여주지 않는 것</b>과 <b>받을 사람에게 안 보여주지 않는 것</b> 두 방향이다.
 * 지급 방식(RANK / RANDOM_FINISHER)에 따라 판정 근거가 완전히 달라지는데, 한쪽 규칙을
 * 다른 쪽에 적용하면 조용히 틀린 답이 나간다 — 그 교차를 특히 고정한다.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PrizeResultServiceTest {

  private static final Long CHALLENGE_ID = 7L;

  @Mock ChallengeRepository challengeRepository;
  @Mock ChallengeMemberRepository memberRepository;
  @Mock ChallengePrizeRepository prizeRepository;
  @Mock RaceFinalizationService raceFinalizationService;
  @Mock PrizeDrawingService prizeDrawingService;

  private PrizeResultService service;
  private UUID userId;

  @BeforeEach
  void setUp() {
    service = new PrizeResultService(
        challengeRepository,
        memberRepository,
        prizeRepository,
        raceFinalizationService,
        prizeDrawingService);
    userId = UUID.randomUUID();
  }

  private Challenge challenge(PrizeAwardType type, boolean ended) {
    Challenge challenge = Challenge.builder()
        .id(CHALLENGE_ID)
        .prizeAwardType(type)
        .build();
    if (ended) challenge.end();
    return challenge;
  }

  private ChallengeMember member(OffsetDateTime finishedAt, Integer finalRank) {
    ChallengeMember member = mock(ChallengeMember.class);
    when(member.getFinishedAt()).thenReturn(finishedAt);
    when(member.getFinalRank()).thenReturn(finalRank);
    return member;
  }

  private void given(Challenge challenge, ChallengeMember member) {
    when(challengeRepository.getRequiredForUpdate(CHALLENGE_ID)).thenReturn(challenge);
    when(memberRepository.findByChallengeIdAndUserId(CHALLENGE_ID, userId))
        .thenReturn(Optional.ofNullable(member));
    when(memberRepository.findAllForChallenge(CHALLENGE_ID)).thenReturn(List.of());
  }

  private PrizeResultResponse result() {
    return service.getMyResult(userId, CHALLENGE_ID);
  }

  @Nested
  class Gates {

    /** 참가자가 아니면 경품 정보를 아예 볼 수 없어야 한다. */
    @Test
    void nonMemberIsRejected() {
      given(challenge(PrizeAwardType.RANK, true), null);

      ApiException error = assertThrows(ApiException.class, PrizeResultServiceTest.this::result);

      assertEquals("not_a_member", error.code());
    }

    /** 아직 안 끝났으면 결과를 알려주지 않는다 — 추첨도 돌리면 안 된다. */
    @Test
    void beforeEndReturnsBeforeEndAndDoesNotDraw() {
      given(challenge(PrizeAwardType.RANDOM_FINISHER, false), member(null, null));

      PrizeResultResponse response = result();

      assertEquals("BEFORE_END", response.status());
      assertNull(response.prizeRank());
      assertNull(response.prizeName());
      verify(prizeDrawingService, never()).drawIfNeeded(any(), any());
    }

    /** 기간이 지났는데 아직 종료 처리 전이면 이 자리에서 확정시킨다. */
    @Test
    void timeEndedRaceIsFinalizedOnRead() {
      Challenge challenge = challenge(PrizeAwardType.RANK, false);
      given(challenge, member(null, 1));
      // finalizeIfTimeEnded가 실제로 종료 상태로 전이시키는 상황을 재현한다.
      when(raceFinalizationService.finalizeIfTimeEnded(any(), any()))
          .thenAnswer(inv -> {
            challenge.end();
            return true;
          });
      when(prizeRepository.findByChallengeIdAndRank(CHALLENGE_ID, 1))
          .thenReturn(Optional.of(ChallengePrize.of(CHALLENGE_ID, 1, "치킨", null)));

      PrizeResultResponse response = result();

      assertEquals("WINNER", response.status());
      verify(prizeDrawingService).drawIfNeeded(any(), any());
    }

    /** 이미 종료된 레이스는 다시 확정하려 들지 않는다. */
    @Test
    void alreadyEndedRaceIsNotFinalizedAgain() {
      given(challenge(PrizeAwardType.RANK, true), member(null, null));

      result();

      verify(raceFinalizationService, never()).finalizeIfTimeEnded(any(), any());
    }
  }

  /** 등수 지급 — 판정 근거는 최종 등수뿐이다. 완주 여부는 보지 않는다. */
  @Nested
  class RankAward {

    @Test
    void memberWithMatchingRankWins() {
      given(challenge(PrizeAwardType.RANK, true), member(null, 2));
      when(prizeRepository.findByChallengeIdAndRank(CHALLENGE_ID, 2))
          .thenReturn(Optional.of(ChallengePrize.of(CHALLENGE_ID, 2, "커피", "prizes/x.jpg")));

      PrizeResultResponse response = result();

      assertEquals("WINNER", response.status());
      assertEquals(2, response.prizeRank());
      assertEquals("커피", response.prizeName());
      assertTrue(response.hasImage());
      assertEquals(PrizeAwardType.RANK, response.awardType());
    }

    /** 등수는 있는데 그 등수에 걸린 경품이 없으면 당첨이 아니다. */
    @Test
    void rankWithoutPrizeIsNotWinner() {
      given(challenge(PrizeAwardType.RANK, true), member(null, 5));
      when(prizeRepository.findByChallengeIdAndRank(CHALLENGE_ID, 5)).thenReturn(Optional.empty());

      PrizeResultResponse response = result();

      assertEquals("NOT_WINNER", response.status());
      assertNull(response.prizeRank());
      assertFalse(response.hasImage());
    }

    /** 등수가 없으면(미완주·집계 전) 경품 조회를 시도조차 하지 않는다. */
    @Test
    void missingRankSkipsPrizeLookup() {
      given(challenge(PrizeAwardType.RANK, true), member(null, null));

      PrizeResultResponse response = result();

      assertEquals("NOT_WINNER", response.status());
      verify(prizeRepository, never()).findByChallengeIdAndRank(anyLong(), anyInt());
    }

    /**
     * 등수 지급에서는 추첨 결과(winnerUserId)를 보면 안 된다. 두 판정 근거가 섞이면
     * 등수로 받을 사람과 추첨으로 뽑힌 사람이 어긋난다.
     */
    @Test
    void doesNotConsultDrawWinner() {
      given(challenge(PrizeAwardType.RANK, true), member(OffsetDateTime.now(), 1));
      when(prizeRepository.findByChallengeIdAndRank(CHALLENGE_ID, 1)).thenReturn(Optional.empty());

      result();

      verify(prizeRepository, never()).findByChallengeIdAndWinnerUserId(anyLong(), any());
    }
  }

  /** 랜덤 지급 — 완주자만 대상이고, 판정 근거는 추첨 결과뿐이다. */
  @Nested
  class RandomFinisherAward {

    @Test
    void drawnFinisherWins() {
      given(challenge(PrizeAwardType.RANDOM_FINISHER, true), member(OffsetDateTime.now(), null));
      when(prizeRepository.findByChallengeIdAndWinnerUserId(CHALLENGE_ID, userId))
          .thenReturn(Optional.of(ChallengePrize.of(CHALLENGE_ID, 1, "상품권", null)));

      PrizeResultResponse response = result();

      assertEquals("WINNER", response.status());
      assertEquals("상품권", response.prizeName());
      assertFalse(response.hasImage());
      assertEquals(PrizeAwardType.RANDOM_FINISHER, response.awardType());
    }

    @Test
    void finisherWhoWasNotDrawnIsNotWinner() {
      given(challenge(PrizeAwardType.RANDOM_FINISHER, true), member(OffsetDateTime.now(), null));
      when(prizeRepository.findByChallengeIdAndWinnerUserId(CHALLENGE_ID, userId))
          .thenReturn(Optional.empty());

      assertEquals("NOT_WINNER", result().status());
    }

    /**
     * 미완주자는 NOT_WINNER가 아니라 NOT_ELIGIBLE이다 — 애초에 대상이 아니었다는 것과
     * 뽑히지 않았다는 것은 화면 문구가 다르다.
     */
    @Test
    void unfinishedMemberIsNotEligible() {
      given(challenge(PrizeAwardType.RANDOM_FINISHER, true), member(null, null));

      PrizeResultResponse response = result();

      assertEquals("NOT_ELIGIBLE", response.status());
      assertNull(response.prizeName());
      verify(prizeRepository, never()).findByChallengeIdAndWinnerUserId(anyLong(), any());
    }

    /**
     * 랜덤 지급에서는 등수를 보면 안 된다. 등수 1위라도 추첨에 안 뽑혔으면 당첨이 아니다 —
     * 여기서 등수로 판정하면 남의 경품을 내 것으로 보여주게 된다.
     */
    @Test
    void doesNotConsultFinalRank() {
      given(challenge(PrizeAwardType.RANDOM_FINISHER, true), member(OffsetDateTime.now(), 1));
      when(prizeRepository.findByChallengeIdAndWinnerUserId(CHALLENGE_ID, userId))
          .thenReturn(Optional.empty());

      PrizeResultResponse response = result();

      assertEquals("NOT_WINNER", response.status());
      verify(prizeRepository, never()).findByChallengeIdAndRank(anyLong(), anyInt());
    }

    /** 종료된 레이스를 읽을 때마다 추첨을 시도하되, 실제 실행 여부는 추첨 서비스가 판단한다. */
    @Test
    void drawIsAttemptedAndChallengePersisted() {
      Challenge challenge = challenge(PrizeAwardType.RANDOM_FINISHER, true);
      given(challenge, member(OffsetDateTime.now(), null));

      result();

      verify(prizeDrawingService).drawIfNeeded(any(), any());
      verify(challengeRepository).save(challenge);
    }
  }
}
