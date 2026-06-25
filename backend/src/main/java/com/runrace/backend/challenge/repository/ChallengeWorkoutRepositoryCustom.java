package com.runrace.backend.challenge.repository;

import com.runrace.backend.challenge.domain.ApprovalStatus;
import com.runrace.backend.challenge.domain.ChallengeWorkout;
import com.runrace.backend.challenge.dto.ChallengeWorkoutListItem;
import java.util.List;

/** QueryDSL 기반 커스텀 쿼리 — fetch join 조회. */
public interface ChallengeWorkoutRepositoryCustom {

  List<ChallengeWorkout> findAllByWorkoutSessionId(Long workoutSessionId);

  /** 레이스에 반영된 운동 — 상태 필터 + 시작일 내림차순. */
  List<ChallengeWorkout> findAllByChallengeIdAndApprovalStatusOrderByStartedDesc(
      Long challengeId, ApprovalStatus status);

  /**
   * 승인된 반영 운동 목록 — 거리·시간 등 스칼라만 projection한다.
   * 엔티티(특히 대용량 path_json GPS 트랙)를 로딩하지 않아 전체 공개·대량 조회에도 안전하다.
   */
  List<ChallengeWorkoutListItem> findApprovedWorkoutListItems(Long challengeId);

  List<ChallengeWorkout> findAllByChallengeIdAndApprovalStatus(
      Long challengeId, ApprovalStatus status);
}
