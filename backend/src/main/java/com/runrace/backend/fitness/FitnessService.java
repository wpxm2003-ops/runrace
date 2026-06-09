package com.runrace.backend.fitness;

import com.runrace.backend.auth.AuthPrincipal;
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
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
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
  private final ApplicationEventPublisher eventPublisher;

  @Transactional
  public UpsertResult upsertDailyDistance(
      AuthPrincipal principal, LocalDate date, String source, BigDecimal distanceKm) {
    validateDistance(distanceKm);

    AppUser me = appUserRepository.getRequired(principal.userId());
    DailyDistance record = findOrCreateRecord(me, date, source);

    BigDecimal previousKm = record.getDistanceKm() == null ? BigDecimal.ZERO : record.getDistanceKm();
    record.setDistanceKm(distanceKm);
    record.setUpdatedAt(OffsetDateTime.now());
    dailyDistanceRepository.save(record);

    BigDecimal delta = distanceKm.subtract(previousKm);
    if (delta.signum() != 0) {
      applyDeltaToActiveChallenges(me, delta);
      eventPublisher.publishEvent(new DailyDistanceSyncedEvent(me.getId()));
    }

    return new UpsertResult(previousKm, distanceKm, delta);
  }

  private DailyDistance findOrCreateRecord(AppUser user, LocalDate date, String source) {
    return dailyDistanceRepository
        .findByUserIdAndDateAndSource(user.getId(), date, source)
        .orElseGet(
            () -> {
              DailyDistance record = new DailyDistance();
              record.setUser(user);
              record.setDate(date);
              record.setSource(source);
              record.setCreatedAt(OffsetDateTime.now());
              return record;
            });
  }

  /** 진행 중인 모든 대결의 누적 거리에 델타를 더하고(음수 방지), 완주 여부를 갱신한다. */
  private void applyDeltaToActiveChallenges(AppUser user, BigDecimal delta) {
    OffsetDateTime now = OffsetDateTime.now();
    for (ChallengeMember member : challengeMemberRepository.findAllActiveForUser(user.getId(), now)) {
      if (ChallengeService.isEnded(member.getChallenge(), now)) {
        continue;
      }
      BigDecimal next = member.getTotalKm().add(delta).max(BigDecimal.ZERO);
      member.setTotalKm(next);
      member.setLastSyncAt(now);
      challengeProgressService.onMemberProgress(member, next);
      challengeMemberRepository.save(member);
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
