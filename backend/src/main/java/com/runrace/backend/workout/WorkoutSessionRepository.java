package com.runrace.backend.workout;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface WorkoutSessionRepository extends JpaRepository<WorkoutSession, Long> {
  Optional<WorkoutSession> findByIdAndUserId(Long id, UUID userId);

  /**
   * 기록 목록용 닫힌 프로젝션 — 대용량 {@code path_json}(GPS 트랙)을 제외한 스칼라 컬럼만 SELECT한다.
   * Spring Data가 프로젝션 게터에 대응하는 컬럼만 조회하므로 DB I/O·네트워크 전송·힙 사용을 줄인다.
   */
  List<WorkoutListView> findListByUserIdOrderByCreatedAtDesc(UUID userId);

  List<WorkoutListView> findListByUserIdAndStartedAtGreaterThanEqualAndStartedAtLessThanOrderByStartedAtDesc(
      UUID userId, OffsetDateTime from, OffsetDateTime to);

  /** 기록 목록 응답에 필요한 필드만 노출하는 닫힌 프로젝션(path_json 미포함). */
  interface WorkoutListView {
    Long getId();
    OffsetDateTime getStartedAt();
    OffsetDateTime getEndedAt();
    int getDurationSec();
    int getDistanceM();
    int getCalories();
    Integer getAvgPaceSecPerKm();
    WorkoutType getWorkoutType();
  }

  /**
   * 사용자 운동 요약 집계 — 전체 기록을 메모리로 로드하지 않고 DB에서 한 번에 계산한다.
   * 운동일 수는 KST(Asia/Seoul) 기준 날짜로 distinct 카운트한다.
   */
  @Query(value = """
      select
        coalesce(sum(distance_m), 0)   as "totalDistanceM",
        coalesce(sum(duration_sec), 0) as "totalDurationSec",
        coalesce(sum(calories), 0)     as "totalCalories",
        count(*)                       as "workoutCount",
        count(distinct (started_at at time zone 'Asia/Seoul')::date) as "workoutDayCount"
      from workout_session
      where user_id = :userId
      """, nativeQuery = true)
  WorkoutSummaryAggregate aggregateForUser(@Param("userId") UUID userId);

  /** {@link #aggregateForUser} 결과 투영. */
  interface WorkoutSummaryAggregate {
    long getTotalDistanceM();
    long getTotalDurationSec();
    long getTotalCalories();
    long getWorkoutCount();
    long getWorkoutDayCount();
  }
}
