package com.runrace.backend.fitness;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.challenge.ChallengeMember;
import com.runrace.backend.challenge.ChallengeMemberRepository;
import com.runrace.backend.challenge.ChallengeService;
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
  private final AppUserRepository appUserRepository;
  private final DailyDistanceRepository dailyDistanceRepository;
  private final ChallengeMemberRepository challengeMemberRepository;
  private final ChallengeService challengeService;

  @Transactional
  public UpsertResult upsertDailyDistance(
      AuthPrincipal principal,
      LocalDate date,
      String source,
      BigDecimal distanceKm
  ) {
    if (distanceKm.compareTo(BigDecimal.ZERO) < 0) throw new IllegalArgumentException("distance_negative");
    if (distanceKm.compareTo(BigDecimal.valueOf(200)) > 0) throw new IllegalArgumentException("distance_too_large");

    AppUser me = appUserRepository.findById(principal.userId()).orElseThrow();
    DailyDistance dd =
        dailyDistanceRepository.findByUserIdAndDateAndSource(me.getId(), date, source).orElse(null);

    BigDecimal prev = dd == null ? BigDecimal.ZERO : dd.getDistanceKm();

    if (dd == null) {
      dd = new DailyDistance();
      dd.setUser(me);
      dd.setDate(date);
      dd.setSource(source);
      dd.setCreatedAt(OffsetDateTime.now());
    }
    dd.setDistanceKm(distanceKm);
    dd.setUpdatedAt(OffsetDateTime.now());
    dailyDistanceRepository.save(dd);

    BigDecimal delta = distanceKm.subtract(prev);
    if (delta.compareTo(BigDecimal.ZERO) != 0) {
      List<ChallengeMember> active =
          challengeMemberRepository.findAllActiveForUser(me.getId(), OffsetDateTime.now());
      for (ChallengeMember cm : active) {
        if (ChallengeService.isEnded(cm.getChallenge(), OffsetDateTime.now())) continue;
        BigDecimal next = cm.getTotalKm().add(delta);
        if (next.compareTo(BigDecimal.ZERO) < 0) next = BigDecimal.ZERO;
        cm.setTotalKm(next);
        cm.setLastSyncAt(OffsetDateTime.now());
        challengeService.onMemberProgress(cm, next);
        challengeMemberRepository.save(cm);
      }
    }

    return new UpsertResult(prev, distanceKm, delta);
  }

  public record UpsertResult(BigDecimal prevKm, BigDecimal nowKm, BigDecimal deltaKm) {}
}

