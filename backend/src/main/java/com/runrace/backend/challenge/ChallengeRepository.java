package com.runrace.backend.challenge;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ChallengeRepository extends JpaRepository<Challenge, Long> {
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

  /**
   * 공개 목록 페이지 — phase 필터(all/scheduled/in_progress/ended) + 언어(soft) + 페이징.
   * 참여자 1명짜리 종료방은 숨긴다. 정렬: 예정→진행중→종료, 같은 단계 내 시작일·id 오름차순.
   */
  @Query("""
      select c from Challenge c
      join fetch c.creator
      where (:lang is null or c.langCd = :lang)
        and (
          :phase = 'all'
          or (:phase = 'active' and c.isEnded = false and (c.endAt is null or c.endAt >= :now))
          or (:phase = 'scheduled' and c.isEnded = false and c.startAt > :now)
          or (:phase = 'in_progress' and c.isEnded = false and c.startAt <= :now
                and (c.endAt is null or c.endAt >= :now))
          or (:phase = 'ended' and (c.isEnded = true or (c.endAt is not null and c.endAt < :now)))
        )
        and not (
          (c.isEnded = true or (c.endAt is not null and c.endAt < :now))
          and (select count(m) from ChallengeMember m where m.challenge.id = c.id) <= 1
        )
      order by
        case when c.isEnded = false and c.startAt > :now then 0
             when c.isEnded = false and (c.endAt is null or c.endAt >= :now) then 1
             else 2 end,
        c.startAt asc, c.id asc
      """)
  Slice<Challenge> findPublicPage(
      @Param("lang") String lang,
      @Param("phase") String phase,
      @Param("now") OffsetDateTime now,
      Pageable pageable);

  /**
   * 내가 참여한 레이스 페이지 — phase(all/active/ended) 필터 + 페이징.
   * active = 예정+진행중(아직 종료 안 됨). 정렬: 예정→진행중→종료, 시작일·id 오름차순.
   */
  @Query("""
      select c from Challenge c
      join fetch c.creator
      join ChallengeMember m on m.challenge.id = c.id
      where m.user.id = :userId
        and (
          :phase = 'all'
          or (:phase = 'active' and c.isEnded = false and (c.endAt is null or c.endAt >= :now))
          or (:phase = 'ended' and (c.isEnded = true or (c.endAt is not null and c.endAt < :now)))
        )
      order by
        case when c.isEnded = false and c.startAt > :now then 0
             when c.isEnded = false and (c.endAt is null or c.endAt >= :now) then 1
             else 2 end,
        c.startAt asc, c.id asc
      """)
  Slice<Challenge> findMinePage(
      @Param("userId") UUID userId,
      @Param("phase") String phase,
      @Param("now") OffsetDateTime now,
      Pageable pageable);
}

