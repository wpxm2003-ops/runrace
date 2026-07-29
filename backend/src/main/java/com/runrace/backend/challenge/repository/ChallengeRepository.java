package com.runrace.backend.challenge.repository;

import com.runrace.backend.challenge.domain.Challenge;
import java.util.List;
import java.util.Optional;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChallengeRepository
    extends JpaRepository<Challenge, Long>, ChallengeRepositoryCustom {

  /** 크루 내부 레이스 목록 — 크루 홈 섹션용(최근 시작 순, 상위 10개). */
  List<Challenge> findTop10ByCrewIdOrderByStartAtDesc(Long crewId);

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select c from Challenge c where c.id = :id")
  Optional<Challenge> findByIdForUpdate(@Param("id") Long id);

  /**
   * 여러 레이스가 얽힌 쓰기 작업용 행 잠금. 호출부가 id를 정렬해 전달하고 쿼리도 같은 순서를
   * 강제해, 겹치는 레이스 집합을 동시에 잠그는 요청들 사이에서도 교착을 피한다
   * ({@link com.runrace.backend.crew.repository.CrewRepository#findAllByIdsForUpdate}와 동일 패턴).
   */
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select c from Challenge c where c.id in :ids order by c.id")
  List<Challenge> findAllByIdsForUpdate(@Param("ids") List<Long> ids);
}
