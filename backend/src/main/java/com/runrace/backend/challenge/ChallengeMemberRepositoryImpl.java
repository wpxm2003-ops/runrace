package com.runrace.backend.challenge;

import com.querydsl.core.Tuple;
import com.querydsl.jpa.impl.JPAQueryFactory;
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
}
