package com.runrace.backend.shoe.repository;

import com.runrace.backend.shoe.domain.Shoe;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ShoeRepository extends JpaRepository<Shoe, Long> {

  /** 내 신발 목록(최근 등록 순). */
  List<Shoe> findAllByUser_IdOrderByCreatedAtDesc(UUID userId);

  /** 소유자 확인을 겸한 단건 조회. */
  Optional<Shoe> findByIdAndUser_Id(Long id, UUID userId);

  /** 현재 활성 신발(있으면). */
  Optional<Shoe> findByUser_IdAndActiveTrue(UUID userId);

  long countByUser_Id(UUID userId);
}
