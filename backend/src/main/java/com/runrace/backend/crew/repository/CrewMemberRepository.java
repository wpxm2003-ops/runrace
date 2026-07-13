package com.runrace.backend.crew.repository;

import com.runrace.backend.crew.domain.CrewMember;
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
}
