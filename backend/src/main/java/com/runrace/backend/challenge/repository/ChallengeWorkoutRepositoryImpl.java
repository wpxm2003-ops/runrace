package com.runrace.backend.challenge.repository;

import com.querydsl.core.Tuple;
import com.querydsl.jpa.impl.JPAQueryFactory;
import com.runrace.backend.challenge.domain.ApprovalStatus;
import com.runrace.backend.challenge.domain.ChallengeWorkout;
import com.runrace.backend.challenge.domain.QChallengeWorkout;
import com.runrace.backend.challenge.dto.ChallengeWorkoutListItem;
import com.runrace.backend.common.IsoTime;
import com.runrace.backend.user.domain.QAppUser;
import com.runrace.backend.workout.domain.QWorkoutSession;
import java.util.List;
import lombok.RequiredArgsConstructor;

@RequiredArgsConstructor
public class ChallengeWorkoutRepositoryImpl implements ChallengeWorkoutRepositoryCustom {

  private static final QChallengeWorkout cw = QChallengeWorkout.challengeWorkout;
  private static final QWorkoutSession ws = QWorkoutSession.workoutSession;
  private static final QAppUser user = QAppUser.appUser;

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

  @Override
  public List<ChallengeWorkoutListItem> findApprovedWorkoutListItems(Long challengeId) {
    // 엔티티 fetch join은 대용량 path_json(GPS 트랙)까지 로딩해 힙을 폭증시킨다.
    // 목록에 필요한 스칼라 컬럼만 projection해 path_json을 읽지 않는다.
    List<Tuple> rows = query
        .select(ws.id, user.id, user.nickname, ws.startedAt, ws.endedAt,
            ws.durationSec, ws.distanceM, cw.appliedDistanceM)
        .from(cw)
        .join(cw.workoutSession, ws)
        .join(cw.user, user)
        .where(cw.challenge.id.eq(challengeId), cw.approvalStatus.eq(ApprovalStatus.APPROVED))
        .orderBy(ws.startedAt.desc())
        .fetch();

    return rows.stream()
        .map(t -> {
          String nickname = t.get(user.nickname);
          return new ChallengeWorkoutListItem(
              t.get(ws.id),
              t.get(user.id),
              nickname != null ? nickname : "탈퇴한 러너", // AppUser.getDisplayNickname()과 동일
              IsoTime.format(t.get(ws.startedAt)),
              IsoTime.format(t.get(ws.endedAt)),
              t.get(ws.durationSec),
              t.get(ws.distanceM),
              t.get(cw.appliedDistanceM));
        })
        .toList();
  }
}
