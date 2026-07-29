package com.runrace.backend.crew.repository;

import com.runrace.backend.crew.domain.CrewJoinRequest;
import com.runrace.backend.crew.domain.CrewJoinRequestStatus;
import jakarta.persistence.LockModeType;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CrewJoinRequestRepository extends JpaRepository<CrewJoinRequest, Long> {

  /**
   * 여러 신청 행만 정렬된 순서로 한 번에 잠근다. 연관 크루·사용자를 fetch join하지 않아
   * 데이터베이스가 그 행들까지 우발적으로 잠그면서 전역 user -> crew -> request 순서를
   * 깨뜨리지 않게 한다.
   */
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select r from CrewJoinRequest r where r.id in :ids order by r.id")
  List<CrewJoinRequest> findAllByIdsForUpdate(@Param("ids") List<Long> ids);

  /** 신청 id로 신청자 uid만 가볍게 조회 — 잠금 전 사전조회용(엔티티를 미리 로드하지 않는다). */
  @Query("select r.user.id from CrewJoinRequest r where r.id = :requestId")
  Optional<UUID> findApplicantUserId(@Param("requestId") long requestId);

  /** 승인 잠금 순서(user -> crew -> request)를 정하기 위한 대상 크루 ID 사전조회. */
  @Query("select r.crew.id from CrewJoinRequest r where r.id = :requestId")
  Optional<Long> findCrewId(@Param("requestId") long requestId);

  /** 특정 사용자의 대기중 신청 id 전체 — 잠금 전 사전조회용(엔티티를 미리 로드하지 않는다). */
  @Query("select r.id from CrewJoinRequest r where r.user.id = :userId and r.status = 'PENDING'")
  List<Long> findPendingIdsByUserId(@Param("userId") UUID userId);

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

  /** 특정 유저의 대기중 신청 전체 — 승인 시 타 크루 pending 자동취소, "내 신청 현황" 조회에 공용. */
  @Query("select r from CrewJoinRequest r join fetch r.crew where r.user.id = :userId and r.status = 'PENDING'")
  List<CrewJoinRequest> findPendingByUserId(@Param("userId") UUID userId);
}
