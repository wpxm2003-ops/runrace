package com.runrace.backend.challenge.repository;

import com.runrace.backend.challenge.domain.ChallengePrize;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ChallengePrizeRepository extends JpaRepository<ChallengePrize, Long> {

  List<ChallengePrize> findByChallengeIdOrderByRank(Long challengeId);

  Optional<ChallengePrize> findByChallengeIdAndRank(Long challengeId, int rank);

  Optional<ChallengePrize> findByChallengeIdAndWinnerUserId(Long challengeId, UUID winnerUserId);

  /** 재저장 전 기존 경품 제거. 벌크 DELETE라 즉시 실행(insert 전 unique 충돌 방지). */
  @Modifying
  @Query("delete from ChallengePrize p where p.challengeId = :challengeId")
  void deleteByChallengeId(@Param("challengeId") Long challengeId);

  /** 경품이 하나라도 등록된 레이스 id — 목록 '경품' 뱃지용 일괄 조회(레이스별 개별 쿼리 N+1 방지). */
  @Query("select distinct p.challengeId from ChallengePrize p where p.challengeId in :challengeIds")
  List<Long> findChallengeIdsWithPrize(@Param("challengeIds") List<Long> challengeIds);
}
