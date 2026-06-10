package com.runrace.backend.challenge;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ChallengeRepository extends JpaRepository<Challenge, Long> {
  @Query("""
      select distinct c from Challenge c
      join fetch c.creator
      join ChallengeMember cm on cm.challenge.id = c.id
      where cm.user.id = :userId
      order by c.createdAt desc
      """)
  List<Challenge> findAllForUser(@Param("userId") UUID userId);

  @Query("""
      select c from Challenge c
      join fetch c.creator
      """)
  List<Challenge> findAllWithCreator();

  @Query("""
      select c from Challenge c
      join fetch c.creator
      left join fetch c.winner
      where c.id = :id
      """)
  Optional<Challenge> findByIdWithDetails(@Param("id") Long id);

  @Query("""
      select count(c) from Challenge c
      where c.creator.id = :creatorId
        and c.isEnded = false
        and (c.endAt is null or c.endAt > :now)
      """)
  long countActiveByCreator(@Param("creatorId") UUID creatorId, @Param("now") OffsetDateTime now);

  /** 스케줄러용: 시작됐지만 아직 종료 플래그가 안 박힌 레이스 — 솔로/기간만료 확정 대상. */
  @Query("""
      select c from Challenge c
      join fetch c.creator
      where c.isEnded = false
        and c.startAt <= :now
      """)
  List<Challenge> findStartedNotEnded(@Param("now") OffsetDateTime now);
}

