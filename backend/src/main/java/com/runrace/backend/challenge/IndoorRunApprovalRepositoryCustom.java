package com.runrace.backend.challenge;

import java.util.List;

/** QueryDSL 기반 커스텀 쿼리 — voter fetch join으로 N+1 방지. */
public interface IndoorRunApprovalRepositoryCustom {

  List<IndoorRunApproval> findAllByChallengeWorkoutIdIn(List<Long> challengeWorkoutIds);
}
