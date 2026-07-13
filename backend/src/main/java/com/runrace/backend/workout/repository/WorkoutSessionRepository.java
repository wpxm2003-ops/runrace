package com.runrace.backend.workout.repository;

import com.runrace.backend.workout.domain.WorkoutSession;
import com.runrace.backend.workout.domain.WorkoutType;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface WorkoutSessionRepository extends JpaRepository<WorkoutSession, Long>, WorkoutSessionRepositoryCustom {
  Optional<WorkoutSession> findByIdAndUserId(Long id, UUID userId);

  /** 상세 응답용 — 신발(LAZY)을 함께 로드해 트랜잭션 밖에서도 귀속 신발을 노출한다. */
  @Query("select w from WorkoutSession w left join fetch w.shoe where w.id = :id and w.user.id = :userId")
  Optional<WorkoutSession> findDetailByIdAndUserId(@Param("id") Long id, @Param("userId") UUID userId);

  /** 탈퇴 익명화용 — 사용자 전체 운동 세션(엔티티) 조회. GPS·이미지 제거 + S3 정리에 사용. */
  List<WorkoutSession> findAllByUserId(UUID userId);

  /**
   * 기록 목록용 닫힌 프로젝션 — 대용량 {@code path_json}(GPS 트랙)을 제외한 스칼라 컬럼만 SELECT한다.
   * Spring Data가 프로젝션 게터에 대응하는 컬럼만 조회하므로 DB I/O·네트워크 전송·힙 사용을 줄인다.
   */
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

  /**
   * 재참여 푸시 후보 — 마지막 운동일(KST)이 {@code minDate} 이후인 사용자별
   * (마지막 운동일, 그 날에서 거슬러 올라간 현재 연속 운동일 수)를 반환한다.
   * 별도 상태 저장 없이 "마지막 운동일로부터 N일째"로 발송 주기를 자연 제한하기 위한 입력.
   */
  @Query(value = """
      with dated as (
        select user_id, (started_at at time zone 'Asia/Seoul')::date as d
        from workout_session
        group by user_id, (started_at at time zone 'Asia/Seoul')::date
      ),
      grp as (
        select user_id, d,
               d - (row_number() over (partition by user_id order by d))::int as g
        from dated
      ),
      last_per_user as (
        select user_id, max(d) as last_d from dated group by user_id
      )
      select l.user_id as "userId",
             l.last_d   as "lastDate",
             (select count(*) from grp g
                where g.user_id = l.user_id
                  and g.g = (select g2.g from grp g2
                              where g2.user_id = l.user_id and g2.d = l.last_d)
             )::int as "currentStreak"
      from last_per_user l
      where l.last_d >= :minDate
      """, nativeQuery = true)
  List<ReengageCandidate> findReengageCandidates(@Param("minDate") LocalDate minDate);

  /** {@link #findReengageCandidates} 결과 투영. */
  interface ReengageCandidate {
    UUID getUserId();
    LocalDate getLastDate();
    int getCurrentStreak();
  }

  /**
   * 휴식 복귀 푸시 후보 — 마지막 운동일(KST)이 {@code minDate} 이후인 사용자별 (마지막 운동일)만 반환한다.
   * 연속일 계산이 불필요한 경로용 경량 쿼리(상관 서브쿼리 없음).
   */
  @Query(value = """
      select user_id as "userId",
             max((started_at at time zone 'Asia/Seoul')::date) as "lastDate"
      from workout_session
      group by user_id
      having max((started_at at time zone 'Asia/Seoul')::date) >= :minDate
      """, nativeQuery = true)
  List<UserLastWorkoutDate> findActiveUserLastDates(@Param("minDate") LocalDate minDate);

  /** {@link #findActiveUserLastDates} 결과 투영. */
  interface UserLastWorkoutDate {
    UUID getUserId();
    LocalDate getLastDate();
  }

  /**
   * 사용자 전체 기간 최장 연속 운동일 수 — KST 날짜 기준.
   * 날짜 차이가 1일씩 이어지는 최대 구간 길이를 반환한다.
   */
  @Query(value = """
      with dated as (
        select distinct (started_at at time zone 'Asia/Seoul')::date as d
        from workout_session where user_id = :userId
      ),
      grouped as (
        select d - (row_number() over (order by d))::integer as grp from dated
      )
      select coalesce(max(cnt), 0)
      from (select count(*) cnt from grouped group by grp) s
      """, nativeQuery = true)
  int maxStreakDaysForUser(@Param("userId") UUID userId);

  /** 크루 주간 보드 — 사용자들의 {@code from} 이후 거리·횟수 합계(기록 없는 사용자는 행 없음). */
  @Query("select w.user.id as userId, sum(w.distanceM) as distanceM, count(w) as runs "
      + "from WorkoutSession w where w.user.id in :userIds and w.startedAt >= :from "
      + "group by w.user.id")
  List<UserDistanceAgg> aggregateDistanceSince(
      @Param("userIds") List<UUID> userIds, @Param("from") OffsetDateTime from);

  /** 크루 대항전 채점 — GPS 러닝만 [from, to) 합산(실내런 소급 입력 조작 방지). */
  @Query("select w.user.id as userId, sum(w.distanceM) as distanceM, count(w) as runs "
      + "from WorkoutSession w where w.user.id in :userIds "
      + "and w.startedAt >= :from and w.startedAt < :to and w.workoutType = :workoutType "
      + "group by w.user.id")
  List<UserDistanceAgg> aggregateDistanceBetweenByType(
      @Param("userIds") List<UUID> userIds,
      @Param("from") OffsetDateTime from,
      @Param("to") OffsetDateTime to,
      @Param("workoutType") WorkoutType workoutType);

  /** 크루 지난주 비교·결산 — [from, to) 구간 사용자별 거리·횟수 합계. */
  @Query("select w.user.id as userId, sum(w.distanceM) as distanceM, count(w) as runs "
      + "from WorkoutSession w where w.user.id in :userIds "
      + "and w.startedAt >= :from and w.startedAt < :to "
      + "group by w.user.id")
  List<UserDistanceAgg> aggregateDistanceBetween(
      @Param("userIds") List<UUID> userIds,
      @Param("from") OffsetDateTime from,
      @Param("to") OffsetDateTime to);

  /** {@link #aggregateDistanceSince} 결과 투영. */
  interface UserDistanceAgg {
    UUID getUserId();
    long getDistanceM();
    long getRuns();
  }

  /** 특정 신발의 누적 거리(m) — 교체 알림 임계 판정 + 신발장 표시용. */
  @Query("select coalesce(sum(w.distanceM), 0) from WorkoutSession w where w.shoe.id = :shoeId")
  long sumDistanceByShoeId(@Param("shoeId") Long shoeId);

  /** 사용자의 신발별 누적 거리 — 신발장 목록 1회 조회용. */
  @Query("select w.shoe.id as shoeId, coalesce(sum(w.distanceM), 0) as totalDistanceM "
      + "from WorkoutSession w where w.user.id = :userId and w.shoe.id is not null "
      + "group by w.shoe.id")
  List<ShoeMileageView> sumDistanceByShoeForUser(@Param("userId") UUID userId);

  /** {@link #sumDistanceByShoeForUser} 결과 투영. */
  interface ShoeMileageView {
    Long getShoeId();
    long getTotalDistanceM();
  }
}
