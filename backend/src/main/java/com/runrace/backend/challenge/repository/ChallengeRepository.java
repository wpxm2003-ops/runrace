package com.runrace.backend.challenge.repository;

import com.runrace.backend.challenge.domain.Challenge;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChallengeRepository
    extends JpaRepository<Challenge, Long>, ChallengeRepositoryCustom {

  /** 크루 내부 레이스 목록 — 크루 홈 섹션용(최근 시작 순, 상위 10개). */
  List<Challenge> findTop10ByCrewIdOrderByStartAtDesc(Long crewId);
}
