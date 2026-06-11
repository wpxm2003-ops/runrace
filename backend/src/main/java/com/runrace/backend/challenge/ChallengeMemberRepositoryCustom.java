package com.runrace.backend.challenge;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** QueryDSL 기반 커스텀 쿼리 — fetch join·집계 등. */
public interface ChallengeMemberRepositoryCustom {

  List<ChallengeMember> findAllForChallenge(Long challengeId);

  List<ChallengeMember> findAllActiveForUser(UUID userId, OffsetDateTime now);

  /** 주어진 레이스 id들 중 사용자가 멤버인 것만 — 공개 목록의 "참여" 라벨용. */
  List<Long> findMemberChallengeIds(UUID userId, List<Long> ids);

  List<ChallengeMember> findAllByChallengeIdIn(List<Long> challengeIds);

  /** 레이스별 멤버 수 — challengeId → count. 목록 API N+1 방지용. */
  Map<Long, Long> memberCountsByChallengeId(List<Long> ids);
}
