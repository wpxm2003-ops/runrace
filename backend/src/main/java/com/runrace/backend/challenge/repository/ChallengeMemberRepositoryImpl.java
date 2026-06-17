package com.runrace.backend.challenge.repository;

import com.querydsl.core.Tuple;
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

  @Override
  public List<ChallengeMember> findAllActiveForUser(UUID userId, OffsetDateTime now) {
    return query.selectFrom(member)
        .join(member.challenge).fetchJoin()
        .join(member.user).fetchJoin()
        .where(
            member.user.id.eq(userId),
            member.challenge.startAt.loe(now),
            member.challenge.endAt.isNull().or(member.challenge.endAt.goe(now)),
            member.challenge.isEnded.isFalse(),
            member.finishedAt.isNull())
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
