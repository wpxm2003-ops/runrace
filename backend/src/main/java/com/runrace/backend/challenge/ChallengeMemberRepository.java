package com.runrace.backend.challenge;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
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
      where cm.user.id = :userId
        and cm.challenge.startAt <= :now
        and (cm.challenge.endAt is null or cm.challenge.endAt >= :now)
        and cm.challenge.winner is null
      """)
  List<ChallengeMember> findAllActiveForUser(@Param("userId") UUID userId, @Param("now") OffsetDateTime now);

  long countByChallengeId(Long challengeId);

  Optional<ChallengeMember> findByChallengeIdAndUserId(Long challengeId, UUID userId);
}

