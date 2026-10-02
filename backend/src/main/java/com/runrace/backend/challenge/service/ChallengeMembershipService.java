package com.runrace.backend.challenge.service;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.challenge.domain.Challenge;
import com.runrace.backend.challenge.domain.ChallengeMember;
import com.runrace.backend.challenge.repository.ChallengeMemberRepository;
import com.runrace.backend.challenge.repository.ChallengeRepository;
import com.runrace.backend.common.ApiException;
import com.runrace.backend.crew.repository.CrewMemberRepository;
import com.runrace.backend.history.domain.ActivityAction;
import com.runrace.backend.history.domain.ActivityTargetType;
import com.runrace.backend.history.service.ActivityHistoryService;
import com.runrace.backend.user.domain.AppUser;
import com.runrace.backend.user.repository.AppUserRepository;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 레이스 참가·탈퇴와 정원/크루 자격 검증을 전담한다. */
@Service
@RequiredArgsConstructor
public class ChallengeMembershipService {
  private final AppUserRepository appUserRepository;
  private final ChallengeRepository challengeRepository;
  private final ChallengeMemberRepository challengeMemberRepository;
  private final CrewMemberRepository crewMemberRepository;
  private final ActivityHistoryService activityHistoryService;

  @Transactional
  public void joinRoom(AuthPrincipal principal, Long id) {
    Challenge challenge = challengeRepository.getRequiredForUpdate(id);
    ensureOpen(challenge);
    if (challenge.getCrewId() != null && crewMemberRepository
        .findByCrewIdAndUserId(challenge.getCrewId(), principal.userId()).isEmpty()) {
      throw ApiException.forbidden("not_crew_member");
    }
    if (challengeMemberRepository.findByChallengeIdAndUserId(id, principal.userId()).isPresent()) {
      throw ApiException.conflict("already_member");
    }
    if (challengeMemberRepository.countByChallengeId(id) >= challenge.getMaxMembers()) {
      throw ApiException.conflict("room_full");
    }
    AppUser me = appUserRepository.getRequired(principal.userId());
    try {
      challengeMemberRepository.saveAndFlush(ChallengeMember.builder()
          .challenge(challenge).user(me).totalKm(BigDecimal.ZERO)
          .joinedAt(OffsetDateTime.now()).build());
    } catch (DataIntegrityViolationException e) {
      throw ApiException.conflict("already_member");
    }
    activityHistoryService.recordSelf(
        principal.userId(), ActivityAction.RACE_JOINED, ActivityTargetType.RACE, id);
  }

  @Transactional
  public void leaveRoom(AuthPrincipal principal, Long id) {
    Challenge challenge = challengeRepository.getRequired(id);
    ensureOpen(challenge);
    if (challenge.isOwner(principal.userId())) throw ApiException.badRequest("owner_cannot_leave");
    ChallengeMember member = challengeMemberRepository
        .findByChallengeIdAndUserId(id, principal.userId())
        .orElseThrow(() -> ApiException.notFound("not_member"));
    challengeMemberRepository.delete(member);
    activityHistoryService.recordSelf(
        principal.userId(), ActivityAction.RACE_LEFT, ActivityTargetType.RACE, id);
  }

  private static void ensureOpen(Challenge challenge) {
    if (ChallengeService.hasStarted(challenge, OffsetDateTime.now())) throw ApiException.conflict("already_started");
    if (ChallengeService.isEnded(challenge, OffsetDateTime.now())) throw ApiException.conflict("ended");
  }
}
