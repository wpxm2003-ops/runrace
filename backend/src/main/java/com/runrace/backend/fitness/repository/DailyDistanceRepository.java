package com.runrace.backend.fitness.repository;

import com.runrace.backend.fitness.domain.DailyDistance;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DailyDistanceRepository extends JpaRepository<DailyDistance, UUID> {
  Optional<DailyDistance> findByUserIdAndDateAndSource(UUID userId, LocalDate date, String source);

  /** 탈퇴 시 일별 거리 집계 일괄 삭제. */
  @Modifying
  @Query("delete from DailyDistance d where d.user.id = :id")
  void deleteAllByUser(@Param("id") UUID id);
}

