package com.runrace.backend.challenge.repository;

import com.querydsl.core.Tuple;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.jpa.impl.JPAQueryFactory;
import com.runrace.backend.challenge.domain.ChallengeMember;
import com.runrace.backend.challenge.domain.QChallengeMember;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;

@RequiredArgsConstructor
public class ChallengeMemberRepositoryImpl implements ChallengeMemberRepositoryCustom {

  private static final QChallengeMember member = QChallengeMember.challengeMember;

  private final JPAQueryFactory query;

  @Override
  public List<ChallengeMember> findAllForChallenge(Long challengeId) {
    return query.selectFrom(member)
        .join(member.user).fetchJoin()
        .where(member.challenge.id.eq(challengeId))
        .orderBy(member.totalKm.desc())
        .fetch();
  }

  /**
   * "진행 중·미완주 멤버" 활성 판정 조건 — 잠금 대상(id 조회)과 로드 대상(엔티티 조회)이
   * 반드시 같은 집합이어야 하므로 두 쿼리가 이 조건을 공유한다. 한쪽만 고치면 잠그지 않은
   * 레이스를 로드하거나 잠근 레이스를 빠뜨려 동시성 보장이 조용히 깨진다.
   */
  private static BooleanExpression[] activeForUser(UUID userId, OffsetDateTime now) {
    return new BooleanExpression[] {
        member.user.id.eq(userId),
        member.challenge.startAt.loe(now),
        member.challenge.endAt.isNull().or(member.challenge.endAt.goe(now)),
        member.challenge.isEnded.isFalse(),
        member.finishedAt.isNull(),
    };
  }

  @Override
  public List<Long> findAllActiveChallengeIdsForUser(UUID userId, OffsetDateTime now) {
    return query.select(member.challenge.id)
        .from(member)
        .where(activeForUser(userId, now))
        .orderBy(member.challenge.id.asc())
        .fetch();
  }

  @Override
  public List<ChallengeMember> findAllActiveForUser(UUID userId, OffsetDateTime now) {
    return query.selectFrom(member)
        .join(member.challenge).fetchJoin()
        .join(member.user).fetchJoin()
        .where(activeForUser(userId, now))
        .fetch();
  }

  @Override
  public List<Long> findMemberChallengeIds(UUID userId, List<Long> ids) {
    return query.select(member.challenge.id)
        .from(member)
        .where(member.user.id.eq(userId), member.challenge.id.in(ids))
        .fetch();
  }

  @Override
  public List<ChallengeMember> findAllByChallengeIdIn(List<Long> challengeIds) {
    return query.selectFrom(member)
        .join(member.user).fetchJoin()
        .where(member.challenge.id.in(challengeIds))
        .fetch();
  }

  @Override
  public Map<Long, Long> memberCountsByChallengeId(List<Long> ids) {
    List<Tuple> rows = query.select(member.challenge.id, member.count())
        .from(member)
        .where(member.challenge.id.in(ids))
        .groupBy(member.challenge.id)
        .fetch();
    Map<Long, Long> counts = new HashMap<>();
    for (Tuple row : rows) {
      counts.put(row.get(member.challenge.id), row.get(member.count()));
    }
    return counts;
  }

  @Override
  public List<UUID> findParticipantIdsIn(Long challengeId, List<UUID> candidateIds) {
    if (candidateIds.isEmpty()) return List.of();
    return query.select(member.user.id)
        .from(member)
        .where(member.challenge.id.eq(challengeId), member.user.id.in(candidateIds))
        .fetch();
  }

  @Override
  public List<HeadToHeadPair> findHeadToHeadPairs(UUID meId, List<UUID> opponentIds) {
    if (opponentIds.isEmpty()) {
      return List.of();
    }
    QChallengeMember me = new QChallengeMember("me");
    QChallengeMember op = new QChallengeMember("op");
    List<Tuple> rows = query
        .select(op.user.id, me.finalRank, op.finalRank)
        .from(me)
        .join(op).on(op.challenge.id.eq(me.challenge.id))
        .where(
            me.user.id.eq(meId),
            op.user.id.in(opponentIds),
            me.finalRank.isNotNull(),
            op.finalRank.isNotNull())
        .fetch();
    return rows.stream()
        .map(r -> new HeadToHeadPair(
            r.get(op.user.id),
            r.get(me.finalRank),
            r.get(op.finalRank)))
        .toList();
  }
}
