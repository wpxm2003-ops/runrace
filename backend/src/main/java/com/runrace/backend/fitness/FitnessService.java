package com.runrace.backend.fitness;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.challenge.Challenge;
import com.runrace.backend.challenge.ChallengeMember;
import com.runrace.backend.challenge.ChallengeMemberRepository;
import com.runrace.backend.challenge.ChallengeProgressService;
import com.runrace.backend.challenge.ChallengeService;
import com.runrace.backend.common.ApiException;
import com.runrace.backend.user.AppUser;
import com.runrace.backend.user.AppUserRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class FitnessService {
  private static final BigDecimal MAX_DAILY_KM = BigDecimal.valueOf(200);

  private final AppUserRepository appUserRepository;
  private final DailyDistanceRepository dailyDistanceRepository;
  private final ChallengeMemberRepository challengeMemberRepository;
  private final ChallengeProgressService challengeProgressService;
  private final ChallengeService challengeService;

  @Transactional
  public UpsertResult upsertDailyDistance(
      AuthPrincipal principal, LocalDate date, String source, BigDecimal distanceKm) {
    validateDistance(distanceKm);

    AppUser me = appUserRepository.getRequired(principal.userId());
    DailyDistance record = findOrCreateRecord(me, date, source);

    BigDecimal previousKm = record.getDistanceKm() == null ? BigDecimal.ZERO : record.getDistanceKm();
    record.updateDistance(distanceKm, OffsetDateTime.now());
    dailyDistanceRepository.save(record);

    BigDecimal delta = distanceKm.subtract(previousKm);
    if (delta.signum() != 0) {
      applyDeltaToActiveChallenges(me, delta);
    }

    return new UpsertResult(previousKm, distanceKm, delta);
  }

  private DailyDistance findOrCreateRecord(AppUser user, LocalDate date, String source) {
    return dailyDistanceRepository
        .findByUserIdAndDateAndSource(user.getId(), date, source)
        .orElseGet(() -> DailyDistance.builder()
            .user(user)
            .date(date)
            .source(source)
            .createdAt(OffsetDateTime.now())
            .updatedAt(OffsetDateTime.now())
            .distanceKm(BigDecimal.ZERO)
            .build());
  }

  /**
   * 진행 중인 모든 대결의 누적 거리에 델타를 더하고(음수 방지), 완주/마일스톤/추월 이벤트를 처리한다.
   * applyDistanceToMember를 공통 경로로 사용하여 이벤트 발행 누락을 방지한다.
   */
  private void applyDeltaToActiveChallenges(AppUser user, BigDecimal delta) {
    OffsetDateTime now = OffsetDateTime.now();
    List<ChallengeMember> activeMembers =
        challengeMemberRepository.findAllActiveForUser(user.getId(), now);
    for (ChallengeMember member : activeMembers) {
      Challenge challenge = member.getChallenge();
      if (ChallengeService.isEnded(challenge, now)) continue;
      // endIfSolo: 방장 혼자 남은 레이스 정리
      if (challengeService.endIfSolo(challenge, now)) continue;
      // 음수 델타(수정)는 0 아래로 내려가지 않도록 보정 후 공통 경로 사용
      BigDecimal effectiveDelta = member.getTotalKm().add(delta).max(BigDecimal.ZERO)
          .subtract(member.getTotalKm());
      if (effectiveDelta.signum() == 0) continue;
      challengeProgressService.applyDistanceToMember(member, effectiveDelta, now);
    }
  }

  private void validateDistance(BigDecimal distanceKm) {
    if (distanceKm.signum() < 0) {
      throw ApiException.badRequest("distance_negative");
    }
    if (distanceKm.compareTo(MAX_DAILY_KM) > 0) {
      throw ApiException.badRequest("distance_too_large");
    }
  }

  public record UpsertResult(BigDecimal prevKm, BigDecimal nowKm, BigDecimal deltaKm) {}
}
