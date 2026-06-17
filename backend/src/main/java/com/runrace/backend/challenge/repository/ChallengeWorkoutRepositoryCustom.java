package com.runrace.backend.challenge.repository;

import com.runrace.backend.challenge.domain.ApprovalStatus;
import com.runrace.backend.challenge.domain.ChallengeWorkout;
import java.util.List;

/** QueryDSL 기반 커스텀 쿼리 — fetch join 조회. */
public interface ChallengeWorkoutRepositoryCustom {

  List<ChallengeWorkout> findAllByWorkoutSessionId(Long workoutSessionId);

  /** 레이스에 반영된 운동 — 상태 필터 + 시작일 내림차순. */
  List<ChallengeWorkout> findAllByChallengeIdAndApprovalStatusOrderByStartedDesc(
      Long challengeId, ApprovalStatus status);

  List<ChallengeWorkout> findAllByChallengeIdAndApprovalStatus(
      Long challengeId, ApprovalStatus status);
}
