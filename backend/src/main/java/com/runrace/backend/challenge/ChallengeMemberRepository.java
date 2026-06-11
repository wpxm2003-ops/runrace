package com.runrace.backend.challenge;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChallengeMemberRepository
    extends JpaRepository<ChallengeMember, UUID>, ChallengeMemberRepositoryCustom {

  long countByChallengeId(Long challengeId);

  /** 본인(id)을 제외한 미완주 멤버 수 — 전원 완주 판정용(전체 로스터 로드 회피). */
  long countByChallengeIdAndIdNotAndFinishedAtIsNull(Long challengeId, UUID id);

  Optional<ChallengeMember> findByChallengeIdAndUserId(Long challengeId, UUID userId);
}
