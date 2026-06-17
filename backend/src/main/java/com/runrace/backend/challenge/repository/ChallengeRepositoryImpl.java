package com.runrace.backend.challenge.repository;

import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.core.types.dsl.CaseBuilder;
import com.querydsl.core.types.dsl.Expressions;
import com.querydsl.core.types.dsl.NumberExpression;
import com.querydsl.jpa.JPAExpressions;
import com.querydsl.jpa.impl.JPAQueryFactory;
import com.runrace.backend.challenge.domain.Challenge;
import com.runrace.backend.challenge.domain.QChallenge;
import com.runrace.backend.challenge.domain.QChallengeMember;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.data.domain.SliceImpl;

@RequiredArgsConstructor
public class ChallengeRepositoryImpl implements ChallengeRepositoryCustom {

  private static final QChallenge challenge = QChallenge.challenge;
  private static final QChallengeMember member = QChallengeMember.challengeMember;

  private final JPAQueryFactory query;

  @Override
  public Optional<Challenge> findByIdWithDetails(Long id) {
    return Optional.ofNullable(
        query.selectFrom(challenge)
            .join(challenge.creator).fetchJoin()
            .leftJoin(challenge.winner).fetchJoin()
            .where(challenge.id.eq(id))
            .fetchOne());
  }

  @Override
  public long countActiveByCreator(UUID creatorId, OffsetDateTime now) {
    Long count = query.select(challenge.count())
        .from(challenge)
        .where(
            challenge.creator.id.eq(creatorId),
            challenge.isEnded.isFalse(),
            challenge.endAt.isNull().or(challenge.endAt.gt(now)))
        .fetchOne();
    return count == null ? 0L : count;
  }

  @Override
  public List<Challenge> findStartedNotEnded(OffsetDateTime now) {
    return query.selectFrom(challenge)
        .join(challenge.creator).fetchJoin()
        .where(challenge.isEnded.isFalse(), challenge.startAt.loe(now))
        .fetch();
  }

  @Override
  public Slice<Challenge> findPublicPage(
      String lang, String phase, OffsetDateTime now, Pageable pageable) {
    List<Challenge> rows = query.selectFrom(challenge)
        .join(challenge.creator).fetchJoin()
        .where(
            lang == null ? null : challenge.langCd.eq(lang),
            phaseFilter(phase, now),
            notSoloEnded(now))
        .orderBy(phaseBucket(now).asc(), challenge.startAt.asc(), challenge.id.asc())
        .offset(pageable.getOffset())
        .limit(pageable.getPageSize() + 1L)
        .fetch();
    return toSlice(rows, pageable);
  }

  @Override
  public Slice<Challenge> findMinePage(
      UUID userId, String phase, OffsetDateTime now, Pageable pageable) {
    List<Challenge> rows = query.selectFrom(challenge)
        .join(challenge.creator).fetchJoin()
        .where(
            JPAExpressions.selectOne()
                .from(member)
                .where(member.challenge.eq(challenge), member.user.id.eq(userId))
                .exists(),
            phaseFilter(phase, now))
        .orderBy(phaseBucket(now).asc(), challenge.startAt.asc(), challenge.id.asc())
        .offset(pageable.getOffset())
        .limit(pageable.getPageSize() + 1L)
        .fetch();
    return toSlice(rows, pageable);
  }

  private static Slice<Challenge> toSlice(List<Challenge> rows, Pageable pageable) {
    boolean hasNext = rows.size() > pageable.getPageSize();
    if (hasNext) {
      rows.remove(rows.size() - 1);
    }
    return new SliceImpl<>(rows, pageable, hasNext);
  }

  /** 종료됨 = isEnded 플래그 또는 endAt 경과. */
  private static BooleanExpression endedCond(OffsetDateTime now) {
    return challenge.isEnded.isTrue()
        .or(challenge.endAt.isNotNull().and(challenge.endAt.lt(now)));
  }

  /** phase 필터(null = 전체). */
  private static BooleanExpression phaseFilter(String phase, OffsetDateTime now) {
    if (phase == null) return null;
    return switch (phase) {
      case "active" -> challenge.isEnded.isFalse()
          .and(challenge.endAt.isNull().or(challenge.endAt.goe(now)));
      case "scheduled" -> challenge.isEnded.isFalse().and(challenge.startAt.gt(now));
      case "in_progress" -> challenge.isEnded.isFalse()
          .and(challenge.startAt.loe(now))
          .and(challenge.endAt.isNull().or(challenge.endAt.goe(now)));
      case "ended" -> endedCond(now);
      default -> null;
    };
  }

  /** 참여자 1명 이하인 종료방 숨김 = NOT(종료됨 AND 멤버수<=1). */
  private static BooleanExpression notSoloEnded(OffsetDateTime now) {
    NumberExpression<Long> memberCount = Expressions.asNumber(
        JPAExpressions.select(member.count())
            .from(member)
            .where(member.challenge.id.eq(challenge.id)));
    return endedCond(now).and(memberCount.loe(1L)).not();
  }

  /** 정렬 버킷: 예정(0) → 진행중(1) → 종료(2). */
  private static NumberExpression<Integer> phaseBucket(OffsetDateTime now) {
    return new CaseBuilder()
        .when(challenge.isEnded.isFalse().and(challenge.startAt.gt(now))).then(0)
        .when(challenge.isEnded.isFalse().and(challenge.endAt.isNull().or(challenge.endAt.goe(now)))).then(1)
        .otherwise(2);
  }
}
