package com.runrace.backend.training.repository;

import com.runrace.backend.training.domain.NsmSessionLog;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NsmSessionLogRepository extends JpaRepository<NsmSessionLog, Long> {

  /** 같은 운동 기록으로 이미 로깅했는지 — 저장 재시도 시 중복 방지. */
  boolean existsByWorkoutId(Long workoutId);

  /** 기간 내 완주한 sub-T 세션 수(주간 진척 표시용). */
  long countByUserIdAndCompletedIsTrueAndCompletedAtGreaterThanEqual(
      UUID userId, OffsetDateTime from);

  /**
   * 전 기간 완주 세션(마이 리포트 누적 통계·블록 리포트 구간 집계용).
   * kind별 렙 수 합산은 서비스에서 계산한다(렙당 분수는 세션 종류에 귀속된 상수라 여기 둘 이유가 없다).
   */
  List<NsmSessionLog> findByUserIdAndCompletedIsTrue(UUID userId);

  /** 특정 구간(직전 재측정 ~ 이번 재측정) 완주 세션 — 블록 리포트용. */
  List<NsmSessionLog> findByUserIdAndCompletedIsTrueAndCompletedAtBetween(
      UUID userId, OffsetDateTime from, OffsetDateTime to);
}
