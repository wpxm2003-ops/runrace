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

  /** 스케줄러 전용 — ID만 반환해 메모리 부하 최소화. */
  List<Long> findStartedNotEndedIds(OffsetDateTime now);

  /**
   * 모집 중(아직 시작 전)인 공개 레이스가 하나라도 있는지.
   * 시작한 레이스에는 참가할 수 없으므로(joinRoom의 ensureNotStarted), 신규 유저가 참가할 수 있는
   * 레이스가 존재하는지를 판단하는 기준이다. 자동 보충 스케줄러가 사용한다.
   */
  boolean existsOpenPublicRace(OffsetDateTime now);

  /** 공개 목록 페이지 — phase(all/active/scheduled/in_progress/ended) + 언어(soft) + 1명 종료방 숨김. */
  Slice<Challenge> findPublicPage(String lang, String phase, OffsetDateTime now, Pageable pageable);

  /** 내가 참여한 레이스 페이지 — phase(all/active/ended). */
  Slice<Challenge> findMinePage(UUID userId, String phase, OffsetDateTime now, Pageable pageable);

  /** 크루 내부 레이스 페이지 — phase(active/ended), 예정·진행중 상태 우선 정렬. */
  Slice<Challenge> findCrewPage(Long crewId, String phase, OffsetDateTime now, Pageable pageable);
}
