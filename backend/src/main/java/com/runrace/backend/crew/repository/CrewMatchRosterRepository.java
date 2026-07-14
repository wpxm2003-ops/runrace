package com.runrace.backend.crew.repository;

import com.runrace.backend.crew.domain.CrewMatch;
import com.runrace.backend.crew.domain.CrewMatchRoster;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CrewMatchRosterRepository extends JpaRepository<CrewMatchRoster, Long> {

  /** 매치 로스터 전체(양 크루) — 닉네임 표시용으로 사용자를 함께 로드한다. */
  @Query("select r from CrewMatchRoster r join fetch r.user where r.match.id = :matchId")
  List<CrewMatchRoster> findAllByMatchId(@Param("matchId") Long matchId);

  /**
   * 이 사용자가 현재 진행 중(ACCEPTED, 시작~종료 사이)인 대항전에 출전 중이면 그 로스터 행.
   * 워크아웃 저장 직후 추월 감지에 쓴다 — 진행 중인 대항전이 없으면 empty.
   * 정상 상태에선 최대 1건이지만(크루당 활성 대결 1개), 동시성 틈으로 2건이 생겨도
   * NonUniqueResult로 터지지 않게 List로 받아 첫 건만 쓴다.
   */
  @Query("""
      select r from CrewMatchRoster r
      join fetch r.match m
      join fetch m.challengerCrew join fetch m.opponentCrew
      where r.user.id = :userId and m.status = :accepted and m.isEnded = false
        and m.startAt <= :now and m.endAt > :now
      """)
  List<CrewMatchRoster> findActiveListByUserId(
      @Param("userId") UUID userId, @Param("now") OffsetDateTime now,
      @Param("accepted") CrewMatch.Status accepted);

  default Optional<CrewMatchRoster> findActiveByUserId(UUID userId, OffsetDateTime now) {
    return findActiveListByUserId(userId, now, CrewMatch.Status.ACCEPTED).stream().findFirst();
  }
}
