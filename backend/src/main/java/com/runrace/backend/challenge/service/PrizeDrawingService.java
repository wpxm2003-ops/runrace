package com.runrace.backend.challenge.service;

import com.runrace.backend.challenge.domain.Challenge;
import com.runrace.backend.challenge.domain.ChallengeMember;
import com.runrace.backend.challenge.domain.ChallengePrize;
import com.runrace.backend.challenge.domain.PrizeAwardType;
import com.runrace.backend.challenge.repository.ChallengePrizeRepository;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class PrizeDrawingService {
  private final ChallengePrizeRepository prizeRepository;
  private final SecureRandom random = new SecureRandom();

  public void drawIfNeeded(Challenge challenge, List<ChallengeMember> members) {
    if (challenge.getPrizeAwardType() != PrizeAwardType.RANDOM_FINISHER
        || challenge.getPrizeDrawnAt() != null) {
      return;
    }

    List<ChallengeMember> eligible = new ArrayList<>(
        members.stream().filter(member -> member.getFinishedAt() != null).toList());
    Collections.shuffle(eligible, random);

    List<ChallengePrize> prizes =
        prizeRepository.findByChallengeIdOrderByRank(challenge.getId());
    int winnerCount = Math.min(prizes.size(), eligible.size());
    for (int i = 0; i < winnerCount; i++) {
      prizes.get(i).assignWinner(eligible.get(i).getUser().getId());
    }
    prizeRepository.saveAll(prizes);
    challenge.markPrizeDrawn();
  }
}
