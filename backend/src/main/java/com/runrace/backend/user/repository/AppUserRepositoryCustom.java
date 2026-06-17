package com.runrace.backend.user.repository;

import java.util.Optional;
import java.util.UUID;

/** QueryDSL 기반 커스텀 쿼리. */
public interface AppUserRepositoryCustom {

  /** 푸시 발신 시 수신자 언어만 가볍게 조회한다(엔티티 전체 로드 회피). */
  Optional<String> findLangCdById(UUID id);
}
