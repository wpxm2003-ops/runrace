package com.runrace.backend.crew.repository;

import com.runrace.backend.crew.domain.CrewMatch;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CrewMatchRepository extends JpaRepository<CrewMatch, Long> {

  /** 상세용 — 양 크루를 함께 로드. */
  @Query("select m from CrewMatch m join fetch m.challengerCrew join fetch m.opponentCrew "
      + "where m.id = :id")
  Optional<CrewMatch> findByIdWithCrews(@Param("id") Long id);

  /**
   * 크루의 활성 매치 — 아직 시작 전인(살아있는) PENDING 또는 미종료 ACCEPTED.
   * "크루당 활성 대결 1개" 제한 검사 + 크루 홈 섹션 조회에 쓴다.
   * PENDING의 생존 기준은 시작일시(레이스의 "시작 전까지만 참가 가능"과 동일 원칙) —
   * start_at이 null인 레거시 행(구 모델에서 이관된 미수락 도전장)은 자연히 제외된다.
   * enum은 문자열 리터럴 대신 파라미터로 비교한다(HQL 리터럴 코어션 버전 편차 회피).
   */
  @Query("""
      select m from CrewMatch m join fetch m.challengerCrew join fetch m.opponentCrew
      where (m.challengerCrew.id = :crewId or m.opponentCrew.id = :crewId)
        and ((m.status = :pending and m.startAt > :now)
             or (m.status = :accepted and m.isEnded = false))
      order by m.createdAt desc
      """)
  List<CrewMatch> findActiveWithStatuses(
      @Param("crewId") Long crewId,
      @Param("now") OffsetDateTime now,
      @Param("pending") CrewMatch.Status pending,
      @Param("accepted") CrewMatch.Status accepted);

  default List<CrewMatch> findActiveByCrewId(Long crewId, OffsetDateTime now) {
    return findActiveWithStatuses(
        crewId, now, CrewMatch.Status.PENDING, CrewMatch.Status.ACCEPTED);
  }

  /**
   * 기간(endAt)이 지났지만 아직 종료 확정 안 된 ACCEPTED 매치 id 목록.
   * 아무도 조회하지 않아도 배치가 종료를 확정하도록 CrewMatchScheduler가 주기적으로 쓴다.
   */
  @Query("select m.id from CrewMatch m "
      + "where m.status = :accepted and m.isEnded = false and m.endAt <= :now")
  List<Long> findAcceptedNotEndedIdsBefore(
      @Param("now") OffsetDateTime now, @Param("accepted") CrewMatch.Status accepted);

  default List<Long> findAcceptedNotEndedIds(OffsetDateTime now) {
    return findAcceptedNotEndedIdsBefore(now, CrewMatch.Status.ACCEPTED);
  }

  /** 종료된 대결 중 이 크루가 이긴 수. */
  @Query("select count(m) from CrewMatch m where m.isEnded = true and m.winnerCrewId = :crewId")
  long countWins(@Param("crewId") Long crewId);

  /** 종료된 대결 중 이 크루가 진 수(승자가 있고 내가 아님). */
  @Query("""
      select count(m) from CrewMatch m
      where m.isEnded = true and m.winnerCrewId is not null and m.winnerCrewId <> :crewId
        and (m.challengerCrew.id = :crewId or m.opponentCrew.id = :crewId)
      """)
  long countLosses(@Param("crewId") Long crewId);

  /** 종료된 대결 중 무승부 수. */
  @Query("""
      select count(m) from CrewMatch m
      where m.isEnded = true and m.winnerCrewId is null
        and (m.challengerCrew.id = :crewId or m.opponentCrew.id = :crewId)
      """)
  long countDraws(@Param("crewId") Long crewId);

  /** 종료 대결 최근 순 — 크루 홈 "지난 대결" 카드는 PageRequest(0,1)로 1건만 가져온다. */
  @Query("""
      select m from CrewMatch m join fetch m.challengerCrew join fetch m.opponentCrew
      where m.isEnded = true
        and (m.challengerCrew.id = :crewId or m.opponentCrew.id = :crewId)
      order by m.endAt desc
      """)
  List<CrewMatch> findEndedByCrewId(@Param("crewId") Long crewId, Pageable pageable);

  /** 크루가 주고받은 전체 대항전 — 최신 신청 순. 취소로 삭제된 행은 제외된다. */
  @Query("""
      select m from CrewMatch m join fetch m.challengerCrew join fetch m.opponentCrew
      where m.challengerCrew.id = :crewId or m.opponentCrew.id = :crewId
      order by m.createdAt desc, m.id desc
      """)
  Slice<CrewMatch> findHistoryByCrewId(@Param("crewId") Long crewId, Pageable pageable);
}
