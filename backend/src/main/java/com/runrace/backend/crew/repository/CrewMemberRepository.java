package com.runrace.backend.crew.repository;

import com.runrace.backend.crew.domain.CrewMember;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CrewMemberRepository extends JpaRepository<CrewMember, Long> {
  /** 내 멤버십(사용자당 1개) — 크루를 함께 로드해 트랜잭션 밖에서도 접근 가능하게 한다. */
  @Query("select m from CrewMember m join fetch m.crew where m.user.id = :userId")
  Optional<CrewMember> findByUserId(@Param("userId") UUID userId);

  boolean existsByUserId(UUID userId);

  /** 크루 멤버 전체(가입 순) — 사용자(닉네임)를 함께 로드한다. */
  @Query("select m from CrewMember m join fetch m.user where m.crew.id = :crewId order by m.joinedAt asc")
  List<CrewMember> findAllByCrewIdOrderByJoinedAtAsc(@Param("crewId") Long crewId);

  int countByCrewId(Long crewId);

  Optional<CrewMember> findByCrewIdAndUserId(Long crewId, UUID userId);

  /** 크루 누적 거리(m) — 멤버별 가입 시점 이후 운동만 합산("함께 달린 거리"). */
  @Query(value = "select coalesce(sum(w.distance_m), 0) from workout_session w "
      + "join crew_member m on m.user_id = w.user_id "
      + "where m.crew_id = :crewId and w.started_at >= m.joined_at", nativeQuery = true)
  long sumMemberDistanceSinceJoin(@Param("crewId") Long crewId);

  /**
   * 크루 잔디 — {@code from} 이후 KST 날짜별 "뛴 멤버"(날짜·멤버 distinct 행). 닉네임 표시용.
   * 가입 이후 기록만 집계한다(누적·명예의 전당과 동일한 "함께 달린" 의미론).
   */
  @Query(value = """
      select distinct (w.started_at at time zone 'Asia/Seoul')::date as "day",
             w.user_id as "userId"
      from workout_session w
      join crew_member m on m.user_id = w.user_id
      where m.crew_id = :crewId and w.started_at >= m.joined_at and w.started_at >= :from
      """, nativeQuery = true)
  List<DailyRunnerRow> findDailyRunners(
      @Param("crewId") Long crewId, @Param("from") OffsetDateTime from);

  /** 멤버별 {@code from} 이후 거리·횟수 — 가입 이후 기록만(월간 보드). */
  @Query(value = """
      select w.user_id as "userId", sum(w.distance_m) as "distanceM", count(*) as "runs"
      from workout_session w
      join crew_member m on m.user_id = w.user_id
      where m.crew_id = :crewId and w.started_at >= m.joined_at and w.started_at >= :from
      group by w.user_id
      """, nativeQuery = true)
  List<MemberDistanceAgg> sumMemberDistanceSince(
      @Param("crewId") Long crewId, @Param("from") OffsetDateTime from);

  /** 멤버별 [from, to) 거리·횟수 — 가입 이후 기록만(지난주 결산 등 기간 조회). */
  @Query(value = """
      select w.user_id as "userId", sum(w.distance_m) as "distanceM", count(*) as "runs"
      from workout_session w
      join crew_member m on m.user_id = w.user_id
      where m.crew_id = :crewId and w.started_at >= m.joined_at
        and w.started_at >= :from and w.started_at < :to
      group by w.user_id
      """, nativeQuery = true)
  List<MemberDistanceAgg> sumMemberDistanceBetween(
      @Param("crewId") Long crewId,
      @Param("from") OffsetDateTime from,
      @Param("to") OffsetDateTime to);

  /** {@link #sumMemberDistanceSince}·{@link #sumMemberDistanceBetween} 결과 투영. */
  interface MemberDistanceAgg {
    UUID getUserId();
    long getDistanceM();
    long getRuns();
  }

  /** {@link #findDailyRunners} 결과 투영. */
  interface DailyRunnerRow {
    LocalDate getDay();
    UUID getUserId();
  }

  /** 명예의 전당 — KST 월별·멤버별 거리 합산(가입 시점 이후만). 서비스에서 월별 1위를 뽑는다. */
  @Query(value = """
      select to_char(w.started_at at time zone 'Asia/Seoul', 'YYYY-MM') as "ym",
             w.user_id as "userId",
             sum(w.distance_m) as "distanceM"
      from workout_session w
      join crew_member m on m.user_id = w.user_id
      where m.crew_id = :crewId and w.started_at >= m.joined_at
      group by 1, 2
      """, nativeQuery = true)
  List<MonthlyMemberAgg> aggregateMonthlyMemberDistance(@Param("crewId") Long crewId);

  /** {@link #aggregateMonthlyMemberDistance} 결과 투영. */
  interface MonthlyMemberAgg {
    String getYm();
    UUID getUserId();
    long getDistanceM();
  }
}
