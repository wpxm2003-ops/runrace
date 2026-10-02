package com.runrace.backend.challenge.service;

import com.runrace.backend.challenge.domain.Challenge;
import com.runrace.backend.challenge.domain.ChallengePrize;
import com.runrace.backend.challenge.repository.ChallengeMemberRepository;
import com.runrace.backend.challenge.repository.ChallengePrizeRepository;
import com.runrace.backend.challenge.repository.ChallengeRepository;
import com.runrace.backend.event.ChallengeEvents;
import com.runrace.backend.event.ChallengeEvents.ChallengeEndedNoParticipantsEvent;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 혼자 남은 레이스 정리와 기간 만료 확정을 전담한다. */
@Service
@RequiredArgsConstructor
public class ChallengeLifecycleService {
  private final ChallengeRepository challengeRepository;
  private final ChallengeMemberRepository challengeMemberRepository;
  private final ChallengePrizeRepository challengePrizeRepository;
  private final ApplicationEventPublisher eventPublisher;
  private final RaceFinalizationService raceFinalization;

  public boolean deleteIfSolo(Challenge challenge, OffsetDateTime now) {
    if (challenge.isEnded() || !ChallengeService.hasStarted(challenge, now)) return false;
    if (challengeMemberRepository.countByChallengeId(challenge.getId()) > 1) return false;
    Long challengeId = challenge.getId();
    UUID creatorId = challenge.getCreator().getId();
    List<String> prizeKeys = challengePrizeRepository.findByChallengeIdOrderByRank(challengeId).stream()
        .map(ChallengePrize::getImageKey).filter(Objects::nonNull).toList();
    challengeRepository.delete(challenge);
    ChallengeEvents.publishPrizeCleanup(eventPublisher, prizeKeys);
    eventPublisher.publishEvent(new ChallengeEndedNoParticipantsEvent(challengeId, creatorId));
    return true;
  }

  @Transactional
  public void processRaceLifecycle(Long challengeId, OffsetDateTime now) {
    Challenge challenge = challengeRepository.findById(challengeId).orElse(null);
    if (challenge == null || deleteIfSolo(challenge, now)) return;
    raceFinalization.finalizeIfTimeEnded(challenge, now);
  }
}
