package com.runrace.backend.crew.repository;

import com.runrace.backend.crew.domain.CrewMatchRoster;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CrewMatchRosterRepository extends JpaRepository<CrewMatchRoster, Long> {

  /** 매치 로스터 전체(양 크루) — 닉네임 표시용으로 사용자를 함께 로드한다. */
  @Query("select r from CrewMatchRoster r join fetch r.user where r.match.id = :matchId")
  List<CrewMatchRoster> findAllByMatchId(@Param("matchId") Long matchId);
}
