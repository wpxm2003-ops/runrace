package com.runrace.backend.challenge.repository;

import com.runrace.backend.challenge.domain.ChallengeMember;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** QueryDSL 기반 커스텀 쿼리 — fetch join·집계 등. */
public interface ChallengeMemberRepositoryCustom {

  List<ChallengeMember> findAllForChallenge(Long challengeId);

  /**
   * 활성 레이스 id만 — 멤버 엔티티를 로드하기 전에 잠금 대상을 정하기 위한 스칼라 조회.
   * 잠금 순서 계약을 위해 id 오름차순 정렬을 보장한다. 활성 판정 조건은
   * {@link #findAllActiveForUser}와 반드시 같은 집합이어야 한다(Impl에서 조건을 공유).
   */
  List<Long> findAllActiveChallengeIdsForUser(UUID userId, OffsetDateTime now);

  List<ChallengeMember> findAllActiveForUser(UUID userId, OffsetDateTime now);

  /** 주어진 레이스 id들 중 사용자가 멤버인 것만 — 공개 목록의 "참여" 라벨용. */
  List<Long> findMemberChallengeIds(UUID userId, List<Long> ids);

  List<ChallengeMember> findAllByChallengeIdIn(List<Long> challengeIds);

  /** 레이스별 멤버 수 — challengeId → count. 목록 API N+1 방지용. */
  Map<Long, Long> memberCountsByChallengeId(List<Long> ids);

  /** 한 레이스의 참여자 중 candidateIds에 속하는 user_id만 반환 — 엔티티 로드 없이 ID만 조회. */
  List<UUID> findParticipantIdsIn(Long challengeId, List<UUID> candidateIds);

  /**
   * 전적(head-to-head) 원시 쌍 — 끝난 레이스(final_rank 확정)에서 나(meId)와 상대들이
   * 함께 참여한 건마다 (상대 id, 내 순위, 상대 순위)를 반환한다. 승패 집계는 서비스에서.
   * 별도 집계 테이블 없이 self-join으로 모든 누적 히스토리를 도출한다.
   */
  List<HeadToHeadPair> findHeadToHeadPairs(UUID meId, List<UUID> opponentIds);

  /** 한 레이스에서 나와 상대의 확정 순위 한 쌍. */
  record HeadToHeadPair(UUID opponentId, int myRank, int opRank) {}
}
