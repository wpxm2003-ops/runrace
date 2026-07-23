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
}
