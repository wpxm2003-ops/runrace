package com.runrace.backend.challenge.repository;

import com.runrace.backend.challenge.domain.Challenge;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;

/** QueryDSL 기반 커스텀 쿼리 — 동적 phase 필터·페이징 등 메서드 이름으로 표현 어려운 조회. */
public interface ChallengeRepositoryCustom {

  Optional<Challenge> findByIdWithDetails(Long id);

  long countActiveByCreator(UUID creatorId, OffsetDateTime now);

  List<Challenge> findStartedNotEnded(OffsetDateTime now);

  /** 공개 목록 페이지 — phase(all/active/scheduled/in_progress/ended) + 언어(soft) + 1명 종료방 숨김. */
  Slice<Challenge> findPublicPage(String lang, String phase, OffsetDateTime now, Pageable pageable);

  /** 내가 참여한 레이스 페이지 — phase(all/active/ended). */
  Slice<Challenge> findMinePage(UUID userId, String phase, OffsetDateTime now, Pageable pageable);
}
