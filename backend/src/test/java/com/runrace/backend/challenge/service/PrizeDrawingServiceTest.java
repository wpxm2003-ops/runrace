package com.runrace.backend.challenge.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.runrace.backend.challenge.domain.Challenge;
import com.runrace.backend.challenge.domain.ChallengeMember;
import com.runrace.backend.challenge.domain.ChallengePrize;
import com.runrace.backend.challenge.domain.PrizeAwardType;
import com.runrace.backend.challenge.repository.ChallengePrizeRepository;
import com.runrace.backend.user.domain.AppUser;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class PrizeDrawingServiceTest {

  @Test
  void assignsEachPrizeToDifferentFinisherAndMarksDrawComplete() {
    ChallengePrizeRepository repository = mock(ChallengePrizeRepository.class);
    PrizeDrawingService service = new PrizeDrawingService(repository);
    Challenge challenge = randomChallenge();
    ChallengePrize first = ChallengePrize.of(7L, 1, "A", null);
    ChallengePrize second = ChallengePrize.of(7L, 2, "B", null);
    when(repository.findByChallengeIdOrderByRank(7L)).thenReturn(List.of(first, second));

    UUID firstUserId = UUID.randomUUID();
    UUID secondUserId = UUID.randomUUID();
    service.drawIfNeeded(
        challenge,
        List.of(finishedMember(firstUserId), finishedMember(secondUserId), unfinishedMember()));

    assertEquals(Set.of(firstUserId, secondUserId), Set.of(first.getWinnerUserId(), second.getWinnerUserId()));
    assertTrue(challenge.getPrizeDrawnAt() != null);
    verify(repository).saveAll(List.of(first, second));
  }

  @Test
  void doesNothingWhenDrawWasAlreadyCompleted() {
    ChallengePrizeRepository repository = mock(ChallengePrizeRepository.class);
    PrizeDrawingService service = new PrizeDrawingService(repository);
    Challenge challenge = Challenge.builder()
        .id(7L)
        .prizeAwardType(PrizeAwardType.RANDOM_FINISHER)
        .prizeDrawnAt(OffsetDateTime.now())
        .build();

    service.drawIfNeeded(challenge, List.of(finishedMember(UUID.randomUUID())));

    verify(repository, never()).findByChallengeIdOrderByRank(7L);
  }

  private static Challenge randomChallenge() {
    return Challenge.builder()
        .id(7L)
        .prizeAwardType(PrizeAwardType.RANDOM_FINISHER)
        .build();
  }

  private static ChallengeMember finishedMember(UUID userId) {
    ChallengeMember member = mock(ChallengeMember.class);
    AppUser user = mock(AppUser.class);
    when(user.getId()).thenReturn(userId);
    when(member.getUser()).thenReturn(user);
    when(member.getFinishedAt()).thenReturn(OffsetDateTime.now());
    return member;
  }

  private static ChallengeMember unfinishedMember() {
    return mock(ChallengeMember.class);
  }
}
