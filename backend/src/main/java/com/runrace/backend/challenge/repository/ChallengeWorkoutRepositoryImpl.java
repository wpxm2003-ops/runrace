package com.runrace.backend.challenge.repository;

import com.querydsl.core.Tuple;
import com.querydsl.jpa.impl.JPAQueryFactory;
import com.runrace.backend.challenge.domain.ApprovalStatus;
import com.runrace.backend.challenge.domain.ChallengeWorkout;
import com.runrace.backend.challenge.domain.QChallengeWorkout;
import com.runrace.backend.challenge.dto.ChallengeWorkoutListItem;
import com.runrace.backend.common.IsoTime;
import com.runrace.backend.user.domain.AppUser;
import com.runrace.backend.user.domain.QAppUser;
import com.runrace.backend.workout.domain.QWorkoutSession;
import com.runrace.backend.workout.domain.WorkoutType;
import jakarta.persistence.LockModeType;
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
  public List<ChallengeWorkout> findAllByWorkoutSessionIdForUpdate(Long workoutSessionId) {
    // 비잠금 쌍둥이와 달리 challenge/user를 fetch join하지 않는다 — 여기서 선적재하면
    // 이후의 레이스 행 잠금(findByIdForUpdate)이 이미 관리 중인 Challenge를 갱신 없이
    // 돌려줘, 잠금 대기 중 다른 트랜잭션이 끝낸 레이스를 stale 상태(isEnded=false)로
    // 보게 된다. 이 경로(투표→승인)는 challenge/user의 id만 쓰므로 LAZY 프록시로 충분하다.
    return query.selectFrom(cw)
        .where(cw.workoutSession.id.eq(workoutSessionId))
        .setLockMode(LockModeType.PESSIMISTIC_WRITE)
        .fetch();
  }

  @Override
  public List<ChallengeWorkout> findAllByChallengeIdAndApprovalStatus(
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
        .select(user.id, user.nickname, ws.startedAt, ws.endedAt,
            ws.durationSec, ws.distanceM, cw.appliedDistanceM, ws.workoutType)
        .from(cw)
        .join(cw.workoutSession, ws)
        .join(cw.user, user)
        .where(cw.challenge.id.eq(challengeId), cw.approvalStatus.eq(ApprovalStatus.APPROVED))
        .orderBy(ws.startedAt.desc())
        .fetch();

    return rows.stream()
        .map(t -> {
          String nickname = t.get(user.nickname);
          WorkoutType type = t.get(ws.workoutType);
          return new ChallengeWorkoutListItem(
              t.get(user.id),
              nickname != null ? nickname : AppUser.WITHDRAWN_NICKNAME, // getDisplayNickname()과 동일
              IsoTime.format(t.get(ws.startedAt)),
              IsoTime.format(t.get(ws.endedAt)),
              t.get(ws.durationSec),
              t.get(ws.distanceM),
              t.get(cw.appliedDistanceM),
              (type != null ? type : WorkoutType.GPS).name());
        })
        .toList();
  }
}
