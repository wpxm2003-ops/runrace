package com.runrace.backend.challenge.service;

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
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class PrizeResultService {
  private final ChallengeRepository challengeRepository;
  private final ChallengeMemberRepository memberRepository;
  private final ChallengePrizeRepository prizeRepository;
  private final RaceFinalizationService raceFinalizationService;
  private final PrizeDrawingService prizeDrawingService;

  @Transactional
  public PrizeResultResponse getMyResult(UUID userId, Long challengeId) {
    Challenge challenge = challengeRepository.findByIdForUpdate(challengeId)
        .orElseThrow(() -> ApiException.notFound("challenge_not_found"));
    ChallengeMember member = memberRepository.findByChallengeIdAndUserId(challengeId, userId)
        .orElseThrow(() -> ApiException.forbidden("not_a_member"));

    OffsetDateTime now = OffsetDateTime.now();
    if (!challenge.isEnded()) {
      raceFinalizationService.finalizeIfTimeEnded(challenge, now);
    }
    if (!challenge.isEnded()) {
      return response(challenge, "BEFORE_END", null);
    }

    List<ChallengeMember> members = memberRepository.findAllForChallenge(challengeId);
    prizeDrawingService.drawIfNeeded(challenge, members);
    challengeRepository.save(challenge);

    if (challenge.getPrizeAwardType() == PrizeAwardType.RANDOM_FINISHER) {
      if (member.getFinishedAt() == null) {
        return response(challenge, "NOT_ELIGIBLE", null);
      }
      ChallengePrize won = prizeRepository
          .findByChallengeIdAndWinnerUserId(challengeId, userId)
          .orElse(null);
      return response(challenge, won == null ? "NOT_WINNER" : "WINNER", won);
    }

    ChallengePrize won = member.getFinalRank() == null
        ? null
        : prizeRepository.findByChallengeIdAndRank(challengeId, member.getFinalRank()).orElse(null);
    return response(challenge, won == null ? "NOT_WINNER" : "WINNER", won);
  }

  private static PrizeResultResponse response(
      Challenge challenge, String status, ChallengePrize prize) {
    return new PrizeResultResponse(
        challenge.getPrizeAwardType(),
        status,
        prize == null ? null : prize.getRank(),
        prize == null ? null : prize.getName(),
        prize != null && prize.getImageKey() != null);
  }
}
