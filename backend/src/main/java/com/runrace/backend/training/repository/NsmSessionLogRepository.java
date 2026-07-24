package com.runrace.backend.training.repository;

import com.runrace.backend.training.domain.NsmSessionLog;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NsmSessionLogRepository extends JpaRepository<NsmSessionLog, Long> {

  /** 같은 운동 기록으로 이미 로깅했는지 — 저장 재시도 시 중복 방지. */
  boolean existsByWorkoutId(Long workoutId);

  /** 기간 내 완주한 sub-T 세션 수(주간 진척 표시용). */
  long countByUserIdAndCompletedIsTrueAndCompletedAtGreaterThanEqual(
      UUID userId, OffsetDateTime from);
}
