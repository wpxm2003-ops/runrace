package com.runrace.backend.challenge.service;

import com.runrace.backend.challenge.domain.Challenge;
import com.runrace.backend.challenge.repository.ChallengeRepository;
import com.runrace.backend.observability.service.ErrorLogService;
import java.time.OffsetDateTime;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 시간 기반 레이스 상태 전환 배치.
 * 아무도 조회하지 않아도 종료가 확정되도록, 시작됐지만 아직 종료 안 된 레이스를 주기적으로 처리한다.
 * - 방장 혼자(참여자 1명) → 삭제
 * - 기간(endAt) 만료 → 상태 ENDED + 우승자 확정
 *
 * <p>단일 인스턴스 전제(분산 락 없음). 여러 대로 확장 시 ShedLock 등 도입 필요.
 */
@Component
@RequiredArgsConstructor
public class ChallengeScheduler {
  private static final Logger log = LoggerFactory.getLogger(ChallengeScheduler.class);

  private final ChallengeRepository challengeRepository;
  private final ChallengeService challengeService;
  private final ErrorLogService errorLogService;

  /** 3분마다 실행. 종료 전환은 급하지 않아 여유 주기로 충분하다. */
  @Scheduled(fixedDelay = 3 * 60 * 1000)
  public void sweepRaceLifecycle() {
    OffsetDateTime now = OffsetDateTime.now();
    // 레이스별 독립 트랜잭션 — 한 건이 실패해도 나머지는 정상 처리되도록 격리한다.
    for (Challenge challenge : challengeRepository.findStartedNotEnded(now)) {
      try {
        challengeService.processRaceLifecycle(challenge.getId(), now);
      } catch (Exception e) {
        log.warn("레이스 생명주기 처리 실패 (challengeId={}) — 건너뜀", challenge.getId(), e);
        errorLogService.recordServiceError(
            "scheduler", e.getClass().getSimpleName(), e.getMessage(),
            ErrorLogService.stackTraceOf(e), "challengeId=" + challenge.getId());
      }
    }
  }
}
