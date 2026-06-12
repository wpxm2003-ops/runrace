package com.runrace.backend.rival;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface RivalRepository extends JpaRepository<Rival, Long> {

  /** 내 라이벌 목록(최근 등록 순) — 상대 사용자까지 fetch join. */
  @Query(
      "select r from Rival r join fetch r.rivalUser"
          + " where r.user.id = :userId order by r.createdAt desc")
  List<Rival> findAllByUserId(UUID userId);

  /** 내가 등록한 라이벌의 사용자 id 목록 — 레이스 화면에서 라이벌 표시·전적 필터용. */
  @Query("select r.rivalUser.id from Rival r where r.user.id = :userId")
  List<UUID> findRivalUserIds(UUID userId);

  boolean existsByUserIdAndRivalUserId(UUID userId, UUID rivalUserId);

  void deleteByUserIdAndRivalUserId(UUID userId, UUID rivalUserId);
}
