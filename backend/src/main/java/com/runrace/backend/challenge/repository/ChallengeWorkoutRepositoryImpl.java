package com.runrace.backend.challenge.repository;

import com.querydsl.jpa.impl.JPAQueryFactory;
import com.runrace.backend.challenge.domain.ApprovalStatus;
import com.runrace.backend.challenge.domain.ChallengeWorkout;
import com.runrace.backend.challenge.domain.QChallengeWorkout;
import com.runrace.backend.workout.QWorkoutSession;
import java.util.List;
import lombok.RequiredArgsConstructor;

@RequiredArgsConstructor
public class ChallengeWorkoutRepositoryImpl implements ChallengeWorkoutRepositoryCustom {

  private static final QChallengeWorkout cw = QChallengeWorkout.challengeWorkout;
  private static final QWorkoutSession ws = QWorkoutSession.workoutSession;

  private final JPAQueryFactory query;

  @Override
  public List<ChallengeWorkout> findAllByWorkoutSessionId(Long workoutSessionId) {
    return query.selectFrom(cw)
        .join(cw.challenge).fetchJoin()
        .join(cw.user).fetchJoin()
        .where(cw.workoutSession.id.eq(workoutSessionId))
        .fetch();
  }

  @Override
  public List<ChallengeWorkout> findAllByChallengeIdAndApprovalStatusOrderByStartedDesc(
      Long challengeId, ApprovalStatus status) {
    return byChallengeAndStatusOrderByStartedDesc(challengeId, status);
  }

  @Override
  public List<ChallengeWorkout> findAllByChallengeIdAndApprovalStatus(
      Long challengeId, ApprovalStatus status) {
    return byChallengeAndStatusOrderByStartedDesc(challengeId, status);
  }

  private List<ChallengeWorkout> byChallengeAndStatusOrderByStartedDesc(
      Long challengeId, ApprovalStatus status) {
    return query.selectFrom(cw)
        .join(cw.workoutSession, ws).fetchJoin()
        .join(cw.user).fetchJoin()
        .where(cw.challenge.id.eq(challengeId), cw.approvalStatus.eq(status))
        .orderBy(ws.startedAt.desc())
        .fetch();
  }
}
