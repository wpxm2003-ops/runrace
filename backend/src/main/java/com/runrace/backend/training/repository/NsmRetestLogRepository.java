package com.runrace.backend.training.repository;

import com.runrace.backend.training.domain.NsmRetestLog;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NsmRetestLogRepository extends JpaRepository<NsmRetestLog, Long> {

  /** 가장 최근 재측정 — 새 저장이 "진짜 재측정"인지(원본 기록이 바뀌었는지) 판단하는 기준. */
  Optional<NsmRetestLog> findTopByUserIdOrderByCreatedAtDesc(UUID userId);

  /** 전체 추이(오래된 순) — 마이 리포트의 역치 그래프용. */
  List<NsmRetestLog> findByUserIdOrderByCreatedAtAsc(UUID userId);

  /** 특정 재측정 직전의 재측정 — 그 사이 구간이 "한 블록"이다. */
  Optional<NsmRetestLog> findTopByUserIdAndCreatedAtLessThanOrderByCreatedAtDesc(
      UUID userId, OffsetDateTime before);
}
