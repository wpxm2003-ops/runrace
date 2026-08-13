package com.runrace.backend.challenge.repository;

import com.runrace.backend.challenge.domain.ApprovalStatus;
import com.runrace.backend.challenge.domain.ChallengeWorkout;
import com.runrace.backend.challenge.dto.ChallengeWorkoutListItem;
import java.util.List;

/** QueryDSL 기반 커스텀 쿼리 — fetch join 조회. */
public interface ChallengeWorkoutRepositoryCustom {

  List<ChallengeWorkout> findAllByWorkoutSessionId(Long workoutSessionId);

  /**
   * {@link #findAllByWorkoutSessionId}와 동일하지만 행 잠금(PESSIMISTIC_WRITE)을 건다.
   * 마지막 두 투표가 거의 동시에 들어오면 잠금 없이는 서로의 커밋 전 상태를 못 봐
   * 둘 다 "전원 승인 아님"으로 끝나 PENDING에 영구 고착된다({@link com.runrace.backend.workout.service.WorkoutService#voteIndoorRun}에서 사용).
   */
  List<ChallengeWorkout> findAllByWorkoutSessionIdForUpdate(Long workoutSessionId);

  /**
   * 승인된 반영 운동 목록 — 거리·시간 등 스칼라만 projection한다.
   * 엔티티(특히 대용량 path_json GPS 트랙)를 로딩하지 않아 전체 공개·대량 조회에도 안전하다.
   */
  List<ChallengeWorkoutListItem> findApprovedWorkoutListItems(Long challengeId);

  /** 레이스에 반영된 운동 — 상태 필터. 시작일 내림차순 정렬이 계약에 포함된다. */
  List<ChallengeWorkout> findAllByChallengeIdAndApprovalStatus(
      Long challengeId, ApprovalStatus status);
}
