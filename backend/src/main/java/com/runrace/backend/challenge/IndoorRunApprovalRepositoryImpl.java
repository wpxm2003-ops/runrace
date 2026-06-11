package com.runrace.backend.challenge;

import com.querydsl.jpa.impl.JPAQueryFactory;
import java.util.List;
import lombok.RequiredArgsConstructor;

@RequiredArgsConstructor
public class IndoorRunApprovalRepositoryImpl implements IndoorRunApprovalRepositoryCustom {

  private static final QIndoorRunApproval approval = QIndoorRunApproval.indoorRunApproval;

  private final JPAQueryFactory query;

  @Override
  public List<IndoorRunApproval> findAllByChallengeWorkoutIdIn(List<Long> challengeWorkoutIds) {
    return query.selectFrom(approval)
        .join(approval.voter).fetchJoin()
        .where(approval.challengeWorkout.id.in(challengeWorkoutIds))
        .fetch();
  }
}
