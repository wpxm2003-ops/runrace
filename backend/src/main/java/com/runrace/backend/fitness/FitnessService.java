package com.runrace.backend.fitness;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.challenge.ChallengeProgressService;
import com.runrace.backend.common.ApiException;
import com.runrace.backend.user.AppUser;
import com.runrace.backend.user.AppUserRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class FitnessService {
  private static final BigDecimal MAX_DAILY_KM = BigDecimal.valueOf(200);

  private final AppUserRepository appUserRepository;
  private final DailyDistanceRepository dailyDistanceRepository;
  private final ChallengeProgressService challengeProgressService;

  @Transactional
  public UpsertResult upsertDailyDistance(
      AuthPrincipal principal, LocalDate date, String source, BigDecimal distanceKm) {
    validateDistance(distanceKm);

    AppUser me = appUserRepository.getRequired(principal.userId());
    DailyDistance record = findOrCreateRecord(me, date, source);

    BigDecimal previousKm = record.getDistanceKm() == null ? BigDecimal.ZERO : record.getDistanceKm();
    record.updateDistance(distanceKm, OffsetDateTime.now());
    try {
      dailyDistanceRepository.saveAndFlush(record);
    } catch (org.springframework.dao.DataIntegrityViolationException e) {
      // 동시 최초 삽입 경쟁 — 깔끔한 4xx로 변환(클라가 재시도). (누적 갱신 정합은 배치 B에서 @Version로)
      throw ApiException.conflict("daily_distance_conflict");
    }

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
   * 진행 중인 모든 레이스의 누적 거리에 델타를 더하고(음수 방지), 완주/마일스톤/추월 이벤트를 처리한다.
   * applyDistanceToMember를 공통 경로로 사용하여 이벤트 발행 누락을 방지한다.
   */
  private void applyDeltaToActiveChallenges(AppUser user, BigDecimal delta) {
    OffsetDateTime now = OffsetDateTime.now();
    // 활성 멤버 순회·방장 혼자 정리·멤버 사전 로드는 공통 경로(forEachActiveChallengeMember)에 위임한다.
    challengeProgressService.forEachActiveChallengeMember(user.getId(), now, (member, allMembers) -> {
      // 음수 델타(수정)는 0 아래로 내려가지 않도록 보정 후 공통 경로 사용
      BigDecimal effectiveDelta = member.getTotalKm().add(delta).max(BigDecimal.ZERO)
          .subtract(member.getTotalKm());
      if (effectiveDelta.signum() == 0) return;
      challengeProgressService.applyDistanceToMemberWithContext(member, effectiveDelta, now, allMembers);
    });
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
