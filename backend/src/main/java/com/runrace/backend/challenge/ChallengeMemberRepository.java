package com.runrace.backend.challenge;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ChallengeMemberRepository extends JpaRepository<ChallengeMember, UUID> {
  @Query("""
      select cm from ChallengeMember cm
      join fetch cm.user
      where cm.challenge.id = :challengeId
      order by cm.totalKm desc
      """)
  List<ChallengeMember> findAllForChallenge(@Param("challengeId") Long challengeId);

  @Query("""
      select cm from ChallengeMember cm
      join fetch cm.challenge
      join fetch cm.user
      where cm.user.id = :userId
        and cm.challenge.startAt <= :now
        and (cm.challenge.endAt is null or cm.challenge.endAt >= :now)
        and cm.challenge.isEnded = false
        and cm.finishedAt is null
      """)
  List<ChallengeMember> findAllActiveForUser(@Param("userId") UUID userId, @Param("now") OffsetDateTime now);

  long countByChallengeId(Long challengeId);

  /** 본인(id)을 제외한 미완주 멤버 수 — 전원 완주 판정용(전체 로스터 로드 회피). */
  long countByChallengeIdAndIdNotAndFinishedAtIsNull(Long challengeId, UUID id);

  Optional<ChallengeMember> findByChallengeIdAndUserId(Long challengeId, UUID userId);

  /**
   * 여러 챌린지의 멤버 수를 한 번의 쿼리로 조회한다.
   * 결과: [challengeId, count] 쌍 목록.
   * 챌린지 목록 API의 N+1 방지용.
   */
  @Query("""
      select cm.challenge.id, count(cm)
      from ChallengeMember cm
      where cm.challenge.id in :ids
      group by cm.challenge.id
      """)
  List<Object[]> countsByChallengeIdIn(@Param("ids") List<Long> ids);
}

