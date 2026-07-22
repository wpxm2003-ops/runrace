package com.runrace.backend.crew.service;

import com.runrace.backend.common.ApiException;
import com.runrace.backend.crew.domain.CrewMember;
import com.runrace.backend.crew.repository.CrewMemberRepository;
import java.util.UUID;

/**
 * CrewService/CrewMatchService가 동일하게 쓰던 "크루 소속 확인" 가드를 공유한다.
 * 정적 유틸로 둔 이유 — 스프링 빈으로 빼면 두 서비스의 생성자 시그니처가 바뀌어
 * 관련 테스트의 Mockito @InjectMocks/@Mock 세팅까지 전부 손대야 한다. 리포지토리를
 * 인자로 받게 하면 기존 crewMemberRepository 모킹을 그대로 재사용할 수 있다.
 */
final class CrewGuards {
  private CrewGuards() {}

  static CrewMember requireMembership(CrewMemberRepository crewMemberRepository, UUID meId) {
    return crewMemberRepository.findByUserId(meId)
        .orElseThrow(() -> ApiException.notFound("not_in_crew"));
  }
}
