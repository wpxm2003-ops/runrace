package com.runrace.backend.crew.repository;

import com.runrace.backend.crew.domain.CrewJoinRequest;
import com.runrace.backend.crew.domain.CrewJoinRequestStatus;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CrewJoinRequestRepository extends JpaRepository<CrewJoinRequest, Long> {

  /** 승인/거절 처리용 — 크루(리더 판정)·신청자를 함께 로드한다. */
  @Query("select r from CrewJoinRequest r "
      + "join fetch r.crew c join fetch c.leader join fetch r.user where r.id = :id")
  Optional<CrewJoinRequest> findWithCrewAndUserById(@Param("id") Long id);

  /** 신청 시점 중복 pending 사전 체크(DB 부분 유니크가 최종 방어선). */
  boolean existsByCrewIdAndUserIdAndStatus(Long crewId, UUID userId, CrewJoinRequestStatus status);

  /** 거절 24h 쿨다운 판정 — 가장 최근 거절 시각. 없으면 쿨다운 없음. */
  @Query("select max(r.decidedAt) from CrewJoinRequest r "
      + "where r.crew.id = :crewId and r.user.id = :userId and r.status = 'REJECTED'")
  Optional<OffsetDateTime> findLastRejectedAt(
      @Param("crewId") Long crewId, @Param("userId") UUID userId);

  /** 도배 방지 — 최근 N시간 내 이 유저의 전체 신청 건수(크루 무관). */
  long countByUserIdAndCreatedAtAfter(UUID userId, OffsetDateTime since);

  /** 리더 인박스 — 이 크루의 대기중 신청, 오래된 순(먼저 온 사람부터 처리). 신청자 닉네임 함께 로드. */
  @Query("select r from CrewJoinRequest r join fetch r.user "
      + "where r.crew.id = :crewId and r.status = 'PENDING' order by r.createdAt asc")
  List<CrewJoinRequest> findPendingByCrewId(@Param("crewId") Long crewId);

  int countByCrewIdAndStatus(Long crewId, CrewJoinRequestStatus status);

  /** 특정 유저의 대기중 신청 전체 — 승인 시 타 크루 pending 자동취소, "내 신청 현황" 조회에 공용. */
  @Query("select r from CrewJoinRequest r join fetch r.crew where r.user.id = :userId and r.status = 'PENDING'")
  List<CrewJoinRequest> findPendingByUserId(@Param("userId") UUID userId);

  /** 이 유저의 이 크루에 대한 대기중 신청 하나(취소용) — 사용자당·크루당 pending은 최대 1건. */
  Optional<CrewJoinRequest> findByCrewIdAndUserIdAndStatus(
      Long crewId, UUID userId, CrewJoinRequestStatus status);
}
