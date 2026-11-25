package com.runrace.backend.goal.repository;

import com.runrace.backend.goal.domain.WeeklyGoal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * 개인 주간 목표 저장소. 목표 진척 계산에 필요한 운동 집계(workout_session)도 여기 둔다 —
 * 모두 사용자 한 명 범위의 읽기 전용 집계이고, (user_id, started_at_local) 인덱스를 탄다.
 */
public interface WeeklyGoalRepository extends JpaRepository<WeeklyGoal, UUID> {

  /** 사용자 IANA 시간대 — 기기에서 동기화된 값(기본 Asia/Seoul). "오늘"을 정하는 기준. */
  @Query(value = "select time_zone from users where id = :userId", nativeQuery = true)
  Optional<String> findUserTimeZone(@Param("userId") UUID userId);

  /** 목표 저장(사용자당 1개). 동시 요청에도 행이 하나만 남도록 upsert로 처리한다. */
  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query(value = """
      insert into user_weekly_goal (user_id, goal_type, target_value, created_at, updated_at)
      values (:userId, :goalType, :targetValue, now(), now())
      on conflict (user_id) do update
        set goal_type = excluded.goal_type,
            target_value = excluded.target_value,
            updated_at = now()
      """, nativeQuery = true)
  void upsert(
      @Param("userId") UUID userId,
      @Param("goalType") String goalType,
      @Param("targetValue") int targetValue);

  /**
   * 이번 주 달성 축하를 선점한다. 이미 같은 주에 축하했으면 0을 반환한다 —
   * 동시 저장이나 목표 변경 뒤 재달성으로 같은 주에 두 번 축하하지 않게 하는 단일 판정점.
   */
  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query(value = """
      update user_weekly_goal
      set last_achieved_week = :weekStart
      where user_id = :userId
        and last_achieved_week is distinct from :weekStart
      """, nativeQuery = true)
  int claimAchievedWeek(@Param("userId") UUID userId, @Param("weekStart") LocalDate weekStart);

  /** [from, to) 현지 벽시계 구간의 거리 합·러닝 수. */
  @Query(value = """
      select coalesce(sum(distance_m), 0) as "distanceM",
             count(*)                     as "runs"
      from workout_session
      where user_id = :userId
        and started_at_local >= :from
        and started_at_local < :to
      """, nativeQuery = true)
  PeriodTotals sumBetween(
      @Param("userId") UUID userId,
      @Param("from") LocalDateTime from,
      @Param("to") LocalDateTime to);

  interface PeriodTotals {
    long getDistanceM();
    long getRuns();
  }

  /** [from, to) 구간을 월요일 시작 주 단위로 묶은 합계. 기록이 없는 주는 행이 없다. */
  @Query(value = """
      select date_trunc('week', started_at_local)::date as "weekStart",
             coalesce(sum(distance_m), 0)               as "distanceM",
             count(*)                                   as "runs"
      from workout_session
      where user_id = :userId
        and started_at_local >= :from
        and started_at_local < :to
      group by 1
      """, nativeQuery = true)
  List<WeekTotals> sumByWeekBetween(
      @Param("userId") UUID userId,
      @Param("from") LocalDateTime from,
      @Param("to") LocalDateTime to);

  interface WeekTotals {
    LocalDate getWeekStart();
    long getDistanceM();
    long getRuns();
  }

  /**
   * 가장 최근 운동일과, 그 날까지 이어진 연속 운동일 수(기기 현지 날짜 기준).
   * 오늘·어제 기준 "현재" 연속인지는 서비스가 사용자 시간대의 오늘과 비교해 정한다.
   * 기록이 없으면 lastDate=null, streak=0.
   */
  @Query(value = """
      with dated as (
        select distinct started_at_local::date as d
        from workout_session where user_id = :userId
      ),
      grp as (
        select d, d - (row_number() over (order by d))::int as g from dated
      )
      select max(d)          as "lastDate",
             count(*)::int   as "streak"
      from grp
      where g = (select g2.g from grp g2 order by g2.d desc limit 1)
      """, nativeQuery = true)
  LatestStreak findLatestStreak(@Param("userId") UUID userId);

  interface LatestStreak {
    LocalDate getLastDate();
    int getStreak();
  }
}
