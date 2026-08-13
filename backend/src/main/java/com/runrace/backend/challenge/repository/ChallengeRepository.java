package com.runrace.backend.challenge.repository;

import com.runrace.backend.challenge.domain.Challenge;
import com.runrace.backend.common.ApiException;
import java.util.List;
import java.util.Optional;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChallengeRepository
    extends JpaRepository<Challenge, Long>, ChallengeRepositoryCustom {

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select c from Challenge c where c.id = :id")
  Optional<Challenge> findByIdForUpdate(@Param("id") Long id);

  /**
   * 여러 레이스가 얽힌 쓰기 작업용 행 잠금. 호출부가 id를 정렬해 전달하고 쿼리도 같은 순서를
   * 강제해, 겹치는 레이스 집합을 동시에 잠그는 요청들 사이에서도 교착을 피한다
   * ({@link com.runrace.backend.crew.repository.CrewRepository#findAllByIdsForUpdate}와 동일 패턴).
   */
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select c from Challenge c where c.id in :ids order by c.id")
  List<Challenge> findAllByIdsForUpdate(@Param("ids") List<Long> ids);

  /** id로 레이스를 조회하되 없으면 404로 변환한다 — AppUserRepository.getRequired 관용구를 따른다. */
  default Challenge getRequired(Long id) {
    return findById(id).orElseThrow(() -> ApiException.notFound("challenge_not_found"));
  }

  /** {@link #findByIdForUpdate} + 없으면 404 — 잠금 조회의 {@code orElseThrow} 중복 제거용. */
  default Challenge getRequiredForUpdate(Long id) {
    return findByIdForUpdate(id).orElseThrow(() -> ApiException.notFound("challenge_not_found"));
  }
}
